param(
  [Parameter(Mandatory=$true)][string]$ProjectId,
  [string]$Region = 'asia-south1',
  [string]$Service = 'parallax-waste-value',
  [string]$Bucket = ''
)

$ErrorActionPreference = 'Stop'
$python = (Get-Command python -ErrorAction SilentlyContinue).Source
if ($python) { $env:CLOUDSDK_PYTHON = $python }
$gcloud = Join-Path $PSScriptRoot '..\.tools\google-cloud-sdk\bin\gcloud.cmd'
if (-not (Test-Path -LiteralPath $gcloud)) { $gcloud = 'gcloud' }
if (-not $Bucket) { $Bucket = "$ProjectId-waste-documents" }

& $gcloud config set project $ProjectId
if ($LASTEXITCODE -ne 0) { throw 'Could not select the Google Cloud project.' }
& $gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com firestore.googleapis.com storage.googleapis.com bigquery.googleapis.com
if ($LASTEXITCODE -ne 0) { throw 'Could not enable required Google Cloud APIs. Check billing and project permissions.' }

$projectNumber = (& $gcloud projects describe $ProjectId --format='value(projectNumber)').Trim()
if ($LASTEXITCODE -ne 0 -or -not $projectNumber) { throw 'Could not read the project number.' }
& $gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$projectNumber-compute@developer.gserviceaccount.com" --role='roles/run.builder' --quiet | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant the Cloud Build service account its required builder role.' }

$serviceAccount = "parallax-runtime@$ProjectId.iam.gserviceaccount.com"
& $gcloud iam service-accounts create parallax-runtime --display-name='WasteRecast runtime' 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Could not create the WasteRecast runtime service account.' }
foreach ($role in @('roles/aiplatform.user','roles/datastore.user','roles/storage.objectCreator','roles/bigquery.jobUser','roles/bigquery.dataEditor')) {
  & $gcloud projects add-iam-policy-binding $ProjectId --member="serviceAccount:$serviceAccount" --role=$role --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant $role to the runtime service account." }
}

& $gcloud firestore databases create --location=$Region --type=firestore-native 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Could not create Firestore in the selected region.' }
& $gcloud storage buckets create "gs://$Bucket" --location=$Region --uniform-bucket-level-access 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Could not create the private document bucket.' }

& $gcloud run deploy $Service --source . --region=$Region --service-account=$serviceAccount --allow-unauthenticated --set-env-vars="GCP_PROJECT_ID=$ProjectId,GCP_LOCATION=$Region,GCS_BUCKET=$Bucket,BIGQUERY_DATASET=waste_value,GEMINI_MODEL=gemini-3.5-flash" --max-instances=3 --timeout=300 --memory=1Gi --quiet
if ($LASTEXITCODE -ne 0) { throw 'Cloud Run deployment failed.' }

Write-Output 'Next: run python -m backend.sync_bigquery using authenticated application-default credentials, then verify the live URL.'
