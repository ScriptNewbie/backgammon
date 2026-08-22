from training_ground.split import match_bucket, split_name


def test_split_is_deterministic() -> None:
    assert match_bucket("example-match") == match_bucket("example-match")
    assert split_name("example-match") == split_name("example-match")


def test_split_ranges() -> None:
    seen: set[str] = set()
    i = 0
    while len(seen) < 3:
        name = split_name(f"match-{i}")
        seen.add(name)
        bucket = match_bucket(f"match-{i}")
        if name == "train":
            assert 0 <= bucket <= 89
        elif name == "val":
            assert 90 <= bucket <= 94
        else:
            assert name == "test"
            assert 95 <= bucket <= 99
        i += 1
    assert seen == {"train", "val", "test"}
