"""FFmpeg input policy for files downloaded from social posts."""

# Limit demuxing to media containers and images. Playlist and manifest formats
# can open other files even when network protocols are disabled.
FFMPEG_MEDIA_INPUT = (
    "-protocol_whitelist", "file",
    "-format_whitelist",
    "mov,m4a,mp4,mj2,matroska,webm,mpegts,mpeg,avi,flv,ogg,asf,mp3,aac,wav,"
    "image2,jpeg_pipe,png_pipe,webp_pipe,gif,bmp_pipe",
)
