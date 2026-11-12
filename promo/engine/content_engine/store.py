"""Where the queue and the media live, so publishing never needs Parth's Mac.

Layout (one private bucket):
  posts/<post_id>.json        one record per post (schedule + approval + per-platform results + metrics)
  media/<week>/<post_id>/...  the files to publish
  state/tg_offset.json        last Telegram update read
  state/ig_token.json         the refreshed Instagram long-lived token
  performance.json            what research reads
"""
from __future__ import annotations

import json
import mimetypes
import shutil
from pathlib import Path
from typing import Any, Protocol


class Store(Protocol):
    def get_json(self, key: str, default: Any = None) -> Any: ...
    def put_json(self, key: str, obj: Any) -> None: ...
    def put_file(self, key: str, path: Path) -> None: ...
    def get_bytes(self, key: str) -> bytes: ...
    def exists(self, key: str) -> bool: ...
    def delete(self, key: str) -> None: ...
    def list(self, prefix: str) -> list[str]: ...
    def media_url(self, key: str, expires: int = 3600) -> str: ...


class LocalStore:
    """A folder. Used by tests and dry runs; media_url returns file:// unless a base URL is given."""

    def __init__(self, root: str | Path, base_url: str = ""):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.base_url = base_url.rstrip("/")

    def _p(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root.resolve() not in p.parents and p != self.root.resolve():
            raise ValueError(f"key escapes the store: {key}")
        return p

    def get_json(self, key, default=None):
        p = self._p(key)
        return json.loads(p.read_text()) if p.exists() else default

    def put_json(self, key, obj):
        p = self._p(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(obj, indent=2, ensure_ascii=False))
        tmp.replace(p)

    def put_file(self, key, path):
        p = self._p(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, p)

    def get_bytes(self, key):
        return self._p(key).read_bytes()

    def exists(self, key):
        return self._p(key).exists()

    def delete(self, key):
        self._p(key).unlink(missing_ok=True)

    def list(self, prefix):
        base = self._p(prefix) if prefix else self.root
        if not base.exists():
            return []
        return sorted(str(p.relative_to(self.root)) for p in base.rglob("*") if p.is_file() and not p.name.endswith(".tmp"))

    def media_url(self, key, expires=3600):
        return f"{self.base_url}/{key}" if self.base_url else self._p(key).as_uri()


class R2Store:
    """Cloudflare R2 through its S3 API (boto3). The bucket stays private: media goes out as presigned URLs
    that Instagram fetches once, unless MEDIA_PUBLIC_BASE points at a public custom domain."""

    def __init__(self, account_id: str, access_key: str, secret_key: str, bucket: str, public_base: str = ""):
        import boto3  # only needed in CI / when staging
        from botocore.config import Config as BotoConfig

        self.s3 = boto3.client(
            "s3",
            endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 4, "mode": "standard"}),
        )
        self.bucket = bucket
        self.public_base = public_base.rstrip("/")

    def get_json(self, key, default=None):
        try:
            body = self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.s3.exceptions.NoSuchKey:
            return default
        return json.loads(body)

    def put_json(self, key, obj):
        self.s3.put_object(Bucket=self.bucket, Key=key, ContentType="application/json",
                           Body=json.dumps(obj, indent=2, ensure_ascii=False).encode())

    def put_file(self, key, path):
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        self.s3.upload_file(str(path), self.bucket, key, ExtraArgs={"ContentType": ctype})

    def get_bytes(self, key):
        return self.s3.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def exists(self, key):
        try:
            self.s3.head_object(Bucket=self.bucket, Key=key)
            return True
        except Exception:
            return False

    def delete(self, key):
        self.s3.delete_object(Bucket=self.bucket, Key=key)

    def list(self, prefix):
        keys, token = [], None
        while True:
            kw = {"Bucket": self.bucket, "Prefix": prefix}
            if token:
                kw["ContinuationToken"] = token
            r = self.s3.list_objects_v2(**kw)
            keys += [o["Key"] for o in r.get("Contents", [])]
            if not r.get("IsTruncated"):
                return sorted(keys)
            token = r["NextContinuationToken"]

    def media_url(self, key, expires=3600):
        if self.public_base:
            return f"{self.public_base}/{key}"
        return self.s3.generate_presigned_url("get_object", Params={"Bucket": self.bucket, "Key": key},
                                              ExpiresIn=expires)


def from_config(cfg) -> Store:
    if cfg.local_store:
        return LocalStore(cfg.local_store, cfg.media_public_base)
    if cfg.r2_bucket:
        return R2Store(cfg.r2_account_id, cfg.r2_access_key_id, cfg.r2_secret_access_key, cfg.r2_bucket,
                       cfg.media_public_base)
    raise SystemExit("No store configured: set R2_* secrets, or ENGINE_LOCAL_STORE=/some/folder for a dry run.")
