from .bq import sync_facilities
from .catalog import load_catalog


if __name__ == "__main__":
    facilities, _ = load_catalog("data/catalog.json")
    print(sync_facilities(facilities))
