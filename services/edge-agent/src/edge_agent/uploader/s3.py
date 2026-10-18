"""``ObjectStore`` backed by boto3 (Apache-2.0), for R2, MinIO or any S3-compatible store."""

from collections.abc import Sequence
from typing import TYPE_CHECKING

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from edge_agent.uploader.multipart import Part, UploadGoneError
from edge_agent.uploader.settings import UploaderSettings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client

# Retries are ours (the next loop turn resumes): fail fast on a cut network.
BOTO_MAX_ATTEMPTS = 2
BOTO_CONNECT_TIMEOUT_S = 10
BOTO_READ_TIMEOUT_S = 60


def make_client(settings: UploaderSettings) -> "S3Client":
    return boto3.client(
        "s3",
        endpoint_url=str(settings.endpoint_url),
        region_name=settings.region,
        aws_access_key_id=settings.access_key_id.get_secret_value(),
        aws_secret_access_key=settings.secret_access_key.get_secret_value(),
        config=Config(
            retries={"max_attempts": BOTO_MAX_ATTEMPTS, "mode": "standard"},
            connect_timeout=BOTO_CONNECT_TIMEOUT_S,
            read_timeout=BOTO_READ_TIMEOUT_S,
            s3={"addressing_style": "path"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


class S3ObjectStore:
    def __init__(self, client: "S3Client", bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def create_upload(self, key: str) -> str:
        response = self._client.create_multipart_upload(Bucket=self._bucket, Key=key)
        return response["UploadId"]

    def upload_part(self, key: str, upload_id: str, number: int, body: bytes) -> str:
        try:
            response = self._client.upload_part(
                Bucket=self._bucket, Key=key, UploadId=upload_id, PartNumber=number, Body=body
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "NoSuchUpload":
                raise UploadGoneError(key) from error
            raise
        return response["ETag"]

    def complete_upload(self, key: str, upload_id: str, parts: Sequence[Part]) -> None:
        self._client.complete_multipart_upload(
            Bucket=self._bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={"Parts": [{"PartNumber": p.number, "ETag": p.etag} for p in parts]},
        )
