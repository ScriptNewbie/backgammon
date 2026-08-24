from training_ground.split import game_bucket, split_name


def test_split_is_deterministic() -> None:
    assert game_bucket("example-game") == game_bucket("example-game")
    assert split_name("example-game") == split_name("example-game")


def test_split_ranges() -> None:
    seen: set[str] = set()
    i = 0
    while len(seen) < 3:
        name = split_name(f"game-{i}")
        seen.add(name)
        bucket = game_bucket(f"game-{i}")
        if name == "train":
            assert 0 <= bucket <= 89
        elif name == "val":
            assert 90 <= bucket <= 94
        else:
            assert name == "test"
            assert 95 <= bucket <= 99
        i += 1
    assert seen == {"train", "val", "test"}
