"""BigQuery catalog index and parameterized category/location candidate query."""
from __future__ import annotations

import os
import re

from .models import Facility, MaterialFamily


def configured() -> bool:
    return bool(os.getenv("GCP_PROJECT_ID") and os.getenv("BIGQUERY_DATASET"))


def _table_id() -> str:
    project = os.environ["GCP_PROJECT_ID"]
    dataset = os.getenv("BIGQUERY_DATASET", "waste_value")
    if not re.fullmatch(r"[A-Za-z0-9_-]+", project) or not re.fullmatch(r"[A-Za-z0-9_]+", dataset):
        raise ValueError("Invalid BigQuery project or dataset identifier")
    return f"{project}.{dataset}.facilities"


def sync_facilities(facilities: list[Facility]) -> dict:
    from google.cloud import bigquery

    client = bigquery.Client(project=os.environ["GCP_PROJECT_ID"])
    dataset_id = ".".join(_table_id().split(".")[:2])
    dataset = bigquery.Dataset(dataset_id)
    dataset.location = os.getenv("GCP_LOCATION", "asia-south1")
    client.create_dataset(dataset, exists_ok=True)
    rows = [{
        "id": facility.id,
        "name": facility.name,
        "state": facility.state,
        "district": facility.city_or_district,
        "families": [family.value for family in facility.families],
        "source_url": facility.source_url,
        "source_page": facility.source_page,
    } for facility in facilities]
    schema = [
        bigquery.SchemaField("id", "STRING"),
        bigquery.SchemaField("name", "STRING"),
        bigquery.SchemaField("state", "STRING"),
        bigquery.SchemaField("district", "STRING"),
        bigquery.SchemaField("families", "STRING", mode="REPEATED"),
        bigquery.SchemaField("source_url", "STRING"),
        bigquery.SchemaField("source_page", "INTEGER"),
    ]
    job = client.load_table_from_json(rows, _table_id(), job_config=bigquery.LoadJobConfig(
        schema=schema,
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
    ))
    job.result()
    return {"table": _table_id(), "rows": len(rows), "job_id": job.job_id}


def candidate_ids(family: MaterialFamily, state: str | None, limit: int = 100) -> list[str]:
    from google.cloud import bigquery

    client = bigquery.Client(project=os.environ["GCP_PROJECT_ID"])
    query = f"""
      SELECT id FROM `{_table_id()}`
      WHERE @family IN UNNEST(families)
      ORDER BY IF(LOWER(state) = LOWER(@state), 0, 1), name
      LIMIT @limit
    """
    config = bigquery.QueryJobConfig(query_parameters=[
        bigquery.ScalarQueryParameter("family", "STRING", family.value),
        bigquery.ScalarQueryParameter("state", "STRING", state or ""),
        bigquery.ScalarQueryParameter("limit", "INT64", limit),
    ])
    return [row.id for row in client.query(query, job_config=config).result()]
