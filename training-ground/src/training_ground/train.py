from __future__ import annotations

import argparse
import random
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch.utils.data import DataLoader

from training_ground.cubeless import cubeless_equity
from training_ground.dataset import CubelessDumpDataset
from training_ground.export import export_onnx_and_pte
from training_ground.features import FEATURE_SIZE
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


def _run_epoch(
    model: CubelessNet,
    loader: DataLoader[tuple[torch.Tensor, torch.Tensor]],
    *,
    optimizer: torch.optim.Optimizer | None,
    device: torch.device,
) -> tuple[float, float]:
    train = optimizer is not None
    model.train(train)
    loss_fn = torch.nn.MSELoss(reduction="sum")
    total_mse = 0.0
    total_eq = 0.0
    n = 0
    grad_ctx = torch.enable_grad() if train else torch.no_grad()
    with grad_ctx:
        for features, labels in loader:
            features = features.to(device)
            labels = labels.to(device)
            if optimizer is not None:
                optimizer.zero_grad(set_to_none=True)
            pred = model(features)
            mse = loss_fn(pred, labels)
            if optimizer is not None:
                (mse / features.shape[0]).backward()
                optimizer.step()
            total_mse += float(mse.detach())
            total_eq += float(
                torch.abs(cubeless_equity(pred.detach()) - cubeless_equity(labels)).sum()
            )
            n += features.shape[0]
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

    train_ds = CubelessDumpDataset(args.dumps, "train")
    val_ds = CubelessDumpDataset(args.dumps, "val")
    if len(train_ds) == 0:
        raise SystemExit(f"no training samples under {args.dumps}")

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
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    start_epoch = 1
    best_val_mse = float("inf")
    best_path = args.checkpoint_dir / "best.pt"

    if args.resume is not None:
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

    print(f"device={device} train={len(train_ds)} val={len(val_ds)}", flush=True)

    for epoch in range(start_epoch, args.epochs + 1):
        train_mse, train_eq = _run_epoch(
            model, train_loader, optimizer=optimizer, device=device
        )
        val_mse, val_eq = _run_epoch(model, val_loader, optimizer=None, device=device)
        print(
            f"epoch {epoch} train_mse={train_mse:.6f} val_mse={val_mse:.6f} "
            f"train_eq_mae={train_eq:.6f} val_eq_mae={val_eq:.6f}",
            flush=True,
        )
        metric = val_mse if len(val_ds) > 0 else train_mse
        if metric <= best_val_mse:
            best_val_mse = metric
            _save_checkpoint(
                best_path,
                model=model,
                optimizer=optimizer,
                epoch=epoch,
                best_val_mse=best_val_mse,
                args=args,
            )

    if args.export_stem is not None:
        if best_path.is_file():
            best_ckpt: dict[str, Any] = torch.load(
                best_path, map_location="cpu", weights_only=False
            )
            model.load_state_dict(best_ckpt["model"])
        stem = Path(args.export_stem)
        stem.parent.mkdir(parents=True, exist_ok=True)
        example = torch.zeros(1, FEATURE_SIZE, dtype=torch.float32)
        export_onnx_and_pte(model, example, stem)
        print(f"exported {stem}.onnx and {stem}.pte", flush=True)


if __name__ == "__main__":
    main()
