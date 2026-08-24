import json
from pathlib import Path

import numpy as np
import pytest
import torch

from helpers import checker_record, cube_record, game_id_for, opening_position, write_batch
from training_ground.board import result_position
from training_ground.cache import CACHE_FORMAT_VERSION, cache_root, ensure_feature_cache
from training_ground.cubeless import CUBELESS_OUTPUT_SIZE, cubeless_equity, cubeless_vector
from training_ground.dataset import CubelessDumpDataset, ShardShuffleSampler
from training_ground.features import FEATURE_SIZE, featurize


def test_cubeless_vector_order_and_equity() -> None:
    vec = cubeless_vector(
        {
            "win": 0.6,
            "gammon": 0.2,
            "backgammon": 0.05,
            "loseGammon": 0.1,
            "loseBackgammon": 0.02,
        }
    )
    assert vec.shape == (CUBELESS_OUTPUT_SIZE,)
    np.testing.assert_allclose(vec, [0.6, 0.2, 0.05, 0.1, 0.02])
    expected = (0.6 + 0.2 + 0.05) - ((1.0 - 0.6) + 0.1 + 0.02)
    got = float(cubeless_equity(torch.tensor(vec)))
    assert got == pytest.approx(expected)


def test_dataset_skips_cube_and_splits_by_game(tmp_path: Path) -> None:
    train_id = game_id_for("train")
    val_id = game_id_for("val")
    write_batch(
        tmp_path,
        [
            checker_record(train_id, "t1", 0.55),
            cube_record(train_id),
            checker_record(val_id, "v1", 0.4),
        ],
    )
    cache = tmp_path / "cache"
    train = CubelessDumpDataset(tmp_path, "train", cache)
    val = CubelessDumpDataset(tmp_path, "val", cache)
    test = CubelessDumpDataset(tmp_path, "test", cache)
    assert len(train) == 1
    assert len(val) == 1
    assert len(test) == 0

    feat, label = train[0]
    expected_pos = result_position(
        opening_position(), [{"from": 8, "to": 5}, {"from": 6, "to": 5}]
    )
    np.testing.assert_allclose(feat.numpy(), featurize(expected_pos), atol=1e-6)
    np.testing.assert_allclose(label.numpy(), [0.55, 0.0, 0.0, 0.0, 0.0], atol=1e-6)
    assert feat.shape == (FEATURE_SIZE,)
    np.testing.assert_allclose(val[0][1].numpy(), [0.4, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_dataset_splits_matchId_only_record(tmp_path: Path) -> None:
    train_id = game_id_for("train")
    rec = checker_record(train_id, "legacy-match", 0.55)
    rec.pop("gameId")
    rec["matchId"] = train_id
    write_batch(tmp_path, [rec])
    train = CubelessDumpDataset(tmp_path, "train", tmp_path / "cache")
    assert len(train) == 1
    np.testing.assert_allclose(train[0][1].numpy(), [0.55, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_dataset_reads_uncompressed_jsonl(tmp_path: Path) -> None:
    write_batch(
        tmp_path,
        [checker_record(game_id_for("train"), "example-opening-31", 0.5)],
        gzipped=False,
    )
    ds = CubelessDumpDataset(tmp_path, "train", tmp_path / "cache")
    assert len(ds) == 1
    assert ds[0][0].shape == (FEATURE_SIZE,)
    assert ds[0][1].shape == (CUBELESS_OUTPUT_SIZE,)


def test_cache_hit_skips_featurize(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.55)])
    cache_dir = tmp_path / "cache"
    first = ensure_feature_cache(tmp_path, cache_dir)
    assert first.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert first.reused_batches == ()

    calls = {"n": 0}

    def boom(*_args: object, **_kwargs: object) -> None:
        calls["n"] += 1
        raise AssertionError("featurize should not run on a cache hit")

    monkeypatch.setattr("training_ground.samples.featurize", boom)
    second = ensure_feature_cache(tmp_path, cache_dir)
    assert second.reused_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert second.rebuilt_batches == ()
    assert calls["n"] == 0
    ds = CubelessDumpDataset(tmp_path, "train", cache_dir, cache=second)
    np.testing.assert_allclose(ds[0][1].numpy(), [0.55, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_cache_rebuilds_when_dump_bytes_change(tmp_path: Path) -> None:
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.55)])
    cache_dir = tmp_path / "cache"
    ensure_feature_cache(tmp_path, cache_dir)
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.99)])
    rebuilt = ensure_feature_cache(tmp_path, cache_dir)
    assert rebuilt.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert rebuilt.reused_batches == ()
    ds = CubelessDumpDataset(tmp_path, "train", cache_dir, cache=rebuilt)
    np.testing.assert_allclose(ds[0][1].numpy(), [0.99, 0.0, 0.0, 0.0, 0.0], atol=1e-6)


def test_cache_incremental_add_and_drop_batch(tmp_path: Path) -> None:
    dumps = tmp_path / "dumps"
    cache_dir = tmp_path / "cache"
    write_batch(
        dumps,
        [checker_record(game_id_for("train"), "a1", 0.55)],
        batch_id="2026-08-22T000000Z-bgweb-api",
    )
    first = ensure_feature_cache(dumps, cache_dir)
    assert first.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)

    write_batch(
        dumps,
        [checker_record(game_id_for("train"), "b1", 0.4)],
        batch_id="2026-08-23T000000Z-bgweb-api",
    )
    added = ensure_feature_cache(dumps, cache_dir)
    assert added.reused_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert added.rebuilt_batches == ("2026-08-23T000000Z-bgweb-api",)
    assert len(CubelessDumpDataset(dumps, "train", cache_dir, cache=added)) == 2

    (dumps / "2026-08-23T000000Z-bgweb-api").rename(tmp_path / "removed-batch")
    dropped = ensure_feature_cache(dumps, cache_dir)
    assert dropped.reused_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert dropped.rebuilt_batches == ()
    assert dropped.batch_dirs == ("2026-08-22T000000Z-bgweb-api",)
    assert not (cache_root(cache_dir) / "batches" / "2026-08-23T000000Z-bgweb-api").exists()
    assert len(CubelessDumpDataset(dumps, "train", cache_dir, cache=dropped)) == 1


def test_cache_wipe_on_code_digest_or_format_change(tmp_path: Path) -> None:
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.55)])
    cache_dir = tmp_path / "cache"
    ensure_feature_cache(tmp_path, cache_dir)
    meta_path = cache_root(cache_dir) / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["code_digest"] = "0" * 64
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    after_digest = ensure_feature_cache(tmp_path, cache_dir)
    assert after_digest.reused_batches == ()
    assert after_digest.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)

    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    meta["v"] = CACHE_FORMAT_VERSION + 1
    meta_path.write_text(json.dumps(meta), encoding="utf-8")
    after_format = ensure_feature_cache(tmp_path, cache_dir)
    assert after_format.reused_batches == ()
    assert after_format.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)


def test_cache_drops_incomplete_building_dir(tmp_path: Path) -> None:
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.55)])
    cache_dir = tmp_path / "cache"
    building = cache_root(cache_dir) / "batches" / "junk.building"
    building.mkdir(parents=True)
    (building / "stale.npy").write_bytes(b"nope")
    ensure_feature_cache(tmp_path, cache_dir)
    assert not building.exists()
    ds = CubelessDumpDataset(tmp_path, "train", cache_dir)
    assert len(ds) == 1


def test_cache_chunks_samples(tmp_path: Path) -> None:
    write_batch(
        tmp_path,
        [
            checker_record(game_id_for("train"), "t1", 0.51),
            checker_record(game_id_for("train"), "t2", 0.52),
            checker_record(game_id_for("train"), "t3", 0.53),
        ],
    )
    cache_dir = tmp_path / "cache"
    cache = ensure_feature_cache(tmp_path, cache_dir, chunk_size=1)
    ds = CubelessDumpDataset(tmp_path, "train", cache_dir, cache=cache, chunk_size=1)
    assert len(ds) == 3
    assert ds.shard_lengths == (1, 1, 1)
    wins = [float(ds[i][1][0]) for i in range(3)]
    assert wins == pytest.approx([0.51, 0.52, 0.53])
    batch_dir = cache_root(cache_dir) / "batches" / "2026-08-22T000000Z-bgweb-api"
    assert (batch_dir / "train-000000.features.npy").is_file()
    assert (batch_dir / "train-000002.features.npy").is_file()
    assert not (batch_dir / "train-000003.features.npy").exists()


def test_rebuild_cache_flag_rebuilds_even_when_fresh(tmp_path: Path) -> None:
    write_batch(tmp_path, [checker_record(game_id_for("train"), "t1", 0.55)])
    cache_dir = tmp_path / "cache"
    ensure_feature_cache(tmp_path, cache_dir)
    forced = ensure_feature_cache(tmp_path, cache_dir, rebuild=True)
    assert forced.rebuilt_batches == ("2026-08-22T000000Z-bgweb-api",)
    assert forced.reused_batches == ()


def test_shard_shuffle_sampler_covers_all_indices() -> None:
    sampler = ShardShuffleSampler((2, 0, 3, 1), generator=torch.Generator().manual_seed(0))
    got = list(sampler)
    assert sorted(got) == list(range(6))
