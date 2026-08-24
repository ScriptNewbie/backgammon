from __future__ import annotations

import argparse
import random
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader

from training_ground.cubeless import cubeless_equity
from training_ground.dataset import CubelessDumpDataset, SplitLoadStats, dump_batch_dirs
from training_ground.export import export_onnx_and_pte
from training_ground.features import FEATURE_SIZE
from training_ground.log import info
from training_ground.model import CubelessNet


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train the cubeless teacher net (ADR 0015).")
    parser.add_argument("--dumps", type=Path, default=Path("/data/dumps"))
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=1024)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--hidden-size", type=int, default=512)
    parser.add_argument("--layers", type=int, default=3, help="hidden Linear+ReLU count")
    parser.add_argument("--checkpoint-dir", type=Path, default=Path("checkpoints"))
    parser.add_argument("--export-stem", type=Path, default=None)
    parser.add_argument("--resume", type=Path, default=None)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--num-workers", type=int, default=0)
    return parser.parse_args(argv)


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _device_label(device: torch.device) -> str:
    if device.type != "cuda":
        return "cpu"
    idx = device.index if device.index is not None else torch.cuda.current_device()
    return f"cuda:{idx} ({torch.cuda.get_device_name(idx)})"


def _param_count(model: CubelessNet) -> int:
    return sum(p.numel() for p in model.parameters())


def _log_split_load(split: str, stats: SplitLoadStats, elapsed_s: float) -> None:
    batches = ", ".join(stats.batch_dirs) if stats.batch_dirs else "(none)"
    info(
        f"loaded {split} split: {stats.samples} samples from "
        f"{stats.records_in_split}/{stats.records_scanned} records "
        f"in {len(stats.batch_dirs)} batch(es) [{batches}] ({elapsed_s:.1f}s)"
    )


def _run_epoch(
    model: CubelessNet,
    loader: DataLoader[tuple[torch.Tensor, torch.Tensor]],
    *,
    optimizer: torch.optim.Optimizer | None,
    device: torch.device,
    progress_label: str | None = None,
) -> tuple[float, float]:
    train = optimizer is not None
    model.train(train)
    loss_fn = torch.nn.MSELoss(reduction="sum")
    total_mse = 0.0
    total_eq = 0.0
    n = 0
    n_batches = len(loader)
    progress_step = max(1, n_batches // 10) if progress_label and n_batches > 1 else 0
    grad_ctx = torch.enable_grad() if train else torch.no_grad()
    with grad_ctx:
        for batch_idx, (features, labels) in enumerate(loader):
            features = features.to(device)
            labels = labels.to(device)
            if optimizer is not None:
                optimizer.zero_grad(set_to_none=True)
            pred = model(features)
            mse = loss_fn(pred, labels)
            if optimizer is not None:
                (mse / features.shape[0]).backward()
                optimizer.step()
            batch_n = features.shape[0]
            total_mse += float(mse.detach())
            total_eq += float(
                torch.abs(cubeless_equity(pred.detach()) - cubeless_equity(labels)).sum()
            )
            n += batch_n
            if progress_step and (batch_idx + 1) % progress_step == 0:
                running_mse = total_mse / n
                running_eq = total_eq / n
                info(
                    f"  {progress_label} batch {batch_idx + 1}/{n_batches} "
                    f"samples={n} mse={running_mse:.6f} eq_mae={running_eq:.6f}"
                )
    if n == 0:
        return float("nan"), float("nan")
    return total_mse / n, total_eq / n


def _save_checkpoint(
    path: Path,
    *,
    model: CubelessNet,
    optimizer: torch.optim.Optimizer,
    epoch: int,
    best_val_mse: float,
    args: argparse.Namespace,
) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "model": model.state_dict(),
            "optimizer": optimizer.state_dict(),
            "epoch": epoch,
            "best_val_mse": best_val_mse,
            "hidden_size": args.hidden_size,
            "layers": args.layers,
        },
        path,
    )


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    set_seed(args.seed)
    device = _device()

    info("training-ground: starting")
    info(f"  dumps={args.dumps}")
    info(
        f"  epochs={args.epochs} batch_size={args.batch_size} lr={args.lr} "
        f"hidden_size={args.hidden_size} layers={args.layers} seed={args.seed}"
    )
    info(f"  checkpoint_dir={args.checkpoint_dir} num_workers={args.num_workers}")
    if args.export_stem is not None:
        info(f"  export_stem={args.export_stem}")
    info(f"  device={_device_label(device)}")

    batch_dirs = dump_batch_dirs(args.dumps)
    if not batch_dirs:
        raise SystemExit(f"no dump batches under {args.dumps}")
    info(f"found {len(batch_dirs)} dump batch(es): {', '.join(batch_dirs)}")

    t0 = time.perf_counter()
    train_ds = CubelessDumpDataset(args.dumps, "train")
    _log_split_load("train", train_ds.stats, time.perf_counter() - t0)

    t0 = time.perf_counter()
    val_ds = CubelessDumpDataset(args.dumps, "val")
    _log_split_load("val", val_ds.stats, time.perf_counter() - t0)

    if len(train_ds) == 0:
        raise SystemExit(f"no training samples under {args.dumps}")

    train_batches = max(1, (len(train_ds) + args.batch_size - 1) // args.batch_size)
    val_batches = max(1, (len(val_ds) + args.batch_size - 1) // args.batch_size) if len(val_ds) else 0
    info(
        f"dataset sizes: train={len(train_ds)} val={len(val_ds)} "
        f"(~{train_batches} train batches/epoch, ~{val_batches} val batches/epoch)"
    )

    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=device.type == "cuda",
    )

    model = CubelessNet(hidden_size=args.hidden_size, layers=args.layers).to(device)
    info(
        f"model CubelessNet({FEATURE_SIZE}→{args.hidden_size}×{args.layers}→5): "
        f"{_param_count(model):,} parameters"
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    start_epoch = 1
    best_val_mse = float("inf")
    best_path = args.checkpoint_dir / "best.pt"

    if args.resume is not None:
        info(f"resuming from {args.resume}")
        ckpt: dict[str, Any] = torch.load(args.resume, map_location=device, weights_only=False)
        if ckpt.get("hidden_size") != args.hidden_size or ckpt.get("layers") != args.layers:
            raise SystemExit(
                "resume checkpoint hidden_size/layers do not match "
                f"{args.hidden_size}/{args.layers}"
            )
        model.load_state_dict(ckpt["model"])
        optimizer.load_state_dict(ckpt["optimizer"])
        start_epoch = int(ckpt["epoch"]) + 1
        best_val_mse = float(ckpt["best_val_mse"])
        info(
            f"  resumed at epoch {start_epoch} "
            f"(checkpoint epoch {ckpt['epoch']}, best_val_mse={best_val_mse:.6f})"
        )

    info(f"training epochs {start_epoch}–{args.epochs}")

    for epoch in range(start_epoch, args.epochs + 1):
        info(f"epoch {epoch}/{args.epochs}: train")
        train_mse, train_eq = _run_epoch(
            model,
            train_loader,
            optimizer=optimizer,
            device=device,
            progress_label="train",
        )
        if len(val_ds) > 0:
            info(f"epoch {epoch}/{args.epochs}: val")
            val_mse, val_eq = _run_epoch(
                model, val_loader, optimizer=None, device=device, progress_label="val"
            )
        else:
            val_mse, val_eq = float("nan"), float("nan")
            info(f"epoch {epoch}/{args.epochs}: val skipped (empty split)")
        info(
            f"epoch {epoch} summary train_mse={train_mse:.6f} val_mse={val_mse:.6f} "
            f"train_eq_mae={train_eq:.6f} val_eq_mae={val_eq:.6f}"
        )
        metric = val_mse if len(val_ds) > 0 else train_mse
        if metric <= best_val_mse:
            prev = best_val_mse
            best_val_mse = metric
            _save_checkpoint(
                best_path,
                model=model,
                optimizer=optimizer,
                epoch=epoch,
                best_val_mse=best_val_mse,
                args=args,
            )
            if prev == float("inf"):
                info(f"  saved new best checkpoint → {best_path} (val_mse={best_val_mse:.6f})")
            else:
                info(
                    f"  saved new best checkpoint → {best_path} "
                    f"(val_mse {prev:.6f} → {best_val_mse:.6f})"
                )
        else:
            info(f"  no checkpoint update (best val_mse={best_val_mse:.6f})")

    info(f"training finished; best val_mse={best_val_mse:.6f} checkpoint={best_path}")

    if args.export_stem is not None:
        stem = Path(args.export_stem)
        if best_path.is_file():
            info(f"loading best checkpoint for export: {best_path}")
            best_ckpt: dict[str, Any] = torch.load(
                best_path, map_location="cpu", weights_only=False
            )
            model.load_state_dict(best_ckpt["model"])
        else:
            info("export: no best checkpoint on disk; using final model weights")
        stem.parent.mkdir(parents=True, exist_ok=True)
        example = torch.zeros(1, FEATURE_SIZE, dtype=torch.float32)
        export_onnx_and_pte(model, example, stem)


if __name__ == "__main__":
    main()
