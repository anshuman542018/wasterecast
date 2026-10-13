"""Optional Google Cloud persistence; local runs remain read-only and stateless."""
from __future__ import annotations

import os
from datetime import datetime, timezone


def persist_analysis(run_id: str, payload: dict) -> bool:
    project = os.getenv("GCP_PROJECT_ID")
    if not project:
        return False
    from google.cloud import firestore

    firestore.Client(project=project).collection("analysis_runs").document(run_id).set({
        "created_at": datetime.now(timezone.utc),
        "payload": payload,
    })
    return True


def store_upload(run_id: str, filename: str, contents: bytes, content_type: str) -> str | None:
    bucket_name = os.getenv("GCS_BUCKET")
    if not bucket_name:
        return None
    from google.cloud import storage

    bucket = storage.Client(project=os.getenv("GCP_PROJECT_ID")).bucket(bucket_name)
    safe_name = "".join(char for char in filename if char.isalnum() or char in "-_.")[:120]
    blob = bucket.blob(f"uploads/{run_id}/{safe_name}")
    blob.upload_from_string(contents, content_type=content_type)
    return f"gs://{bucket_name}/{blob.name}"
