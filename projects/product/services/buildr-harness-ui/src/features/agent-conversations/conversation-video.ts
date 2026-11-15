export type VideoFrames = { duration: number; frames: Array<{ file: File; time: number }> };

/** Decode locally before uploading; no media is sent to another service for extraction. */
export async function extractVideoFrames(file: File): Promise<VideoFrames> {
  const video = document.createElement('video'), url = URL.createObjectURL(file);
  video.muted = true; video.playsInline = true; video.preload = 'auto';
  const wait = (event: 'loadeddata' | 'seeked', start: () => void) => new Promise<void>((resolve,reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener(event,done); video.removeEventListener('error',failed); error ? reject(error) : resolve(); };
    const done = () => finish(), failed = () => finish(new Error('视频编码无法解码，请换用浏览器可播放的 MP4 或 WebM。'));
    const timer = setTimeout(() => finish(new Error('视频画面读取超时，请重新添加或选择较短的视频。')), 10_000);
    video.addEventListener(event,done,{once:true}); video.addEventListener('error',failed,{once:true});
    start();
  });
  try {
    await wait('loadeddata', () => { video.src = url; video.load(); });
    // Some clipboard WebM recordings omit duration until the last cluster is read.
    if (video.duration === Infinity) await wait('seeked', () => { video.currentTime = Number.MAX_SAFE_INTEGER; });
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0 || !video.videoWidth || !video.videoHeight) throw new Error('视频时长或画面无效，请重新导出后添加。');
    const canvas = document.createElement('canvas'), scale = Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));
    canvas.width = Math.max(1,Math.round(video.videoWidth*scale)); canvas.height = Math.max(1,Math.round(video.videoHeight*scale));
    const context = canvas.getContext('2d'); if (!context) throw new Error('当前浏览器无法提取视频画面。');
    const count = Math.min(8,Math.max(2,Math.ceil(duration/2)+1)), frames: VideoFrames['frames'] = [];
    for (let index=0;index<count;index++) {
      const time = Math.max(0,duration-Math.min(0.05,duration/10))*index/(count-1);
      if (Math.abs(video.currentTime-time)>0.001) await wait('seeked', () => { video.currentTime = time; });
      context.drawImage(video,0,0,canvas.width,canvas.height);
      const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('视频画面提取失败。')), 'image/jpeg', 0.8));
      if (blob.size>1024*1024) throw new Error('视频画面过大，请选择较低分辨率的视频。');
      frames.push({ file:new File([blob],`${file.name} ${time.toFixed(2)}s.jpg`,{type:'image/jpeg'}),time });
    }
    return { duration,frames };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
