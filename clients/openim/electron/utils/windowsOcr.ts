import { spawn } from "node:child_process";
import path from "node:path";

// Fixed code, byte-only stdin; no paths, commands, URLs, or account environment.
export const windowsOcrScript = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType=WindowsRuntime]
$null = [Windows.Globalization.Language, Windows.Globalization, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation'+[char]96+'1' } | Select-Object -First 1
function Await($operation, $resultType) {
  $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.GetAwaiter().GetResult()
}
try {
  $inputData = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new('zh-Hans'))
  if (!$engine) { $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages() }
  if (!$engine) { throw 'OCR_LANGUAGE_UNAVAILABLE' }
  $results = @()
  foreach ($tile in $inputData.tiles) {
    $stream = [Windows.Storage.Streams.InMemoryRandomAccessStream]::new()
    $writer = [Windows.Storage.Streams.DataWriter]::new($stream)
    try {
      $writer.WriteBytes([Convert]::FromBase64String($tile))
      $null = Await $writer.StoreAsync() ([uint32])
      $writer.DetachStream() | Out-Null
      $stream.Seek(0)
      $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $bitmap = Await ($decoder.GetSoftwareBitmapAsync([Windows.Graphics.Imaging.BitmapPixelFormat]::Bgra8, [Windows.Graphics.Imaging.BitmapAlphaMode]::Premultiplied)) ([Windows.Graphics.Imaging.SoftwareBitmap])
      try {
        if ($bitmap.PixelWidth -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension -or $bitmap.PixelHeight -gt [Windows.Media.Ocr.OcrEngine]::MaxImageDimension) { throw 'OCR_IMAGE_DIMENSION' }
        $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
        $lines = @($result.Lines | ForEach-Object {
          $words = @($_.Words)
          $minY = ($words | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum
          $maxY = ($words | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum
          $minX = ($words | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum
          @{ text=$_.Text; x=$minX; y=$minY; height=($maxY-$minY) }
        })
        $results += ,@{ lines=$lines }
      } finally { $bitmap.Dispose() }
    } finally { $writer.Dispose(); $stream.Dispose() }
  }
  @{ ok=$true; language=$engine.RecognizerLanguage.LanguageTag; results=$results } | ConvertTo-Json -Depth 8 -Compress
} catch {
  @{ ok=$false; code=($(if ($_.Exception.Message -like '*OCR_LANGUAGE_UNAVAILABLE*') { 'OCR_LANGUAGE_UNAVAILABLE' } else { 'OCR_FAILED' })) } | ConvertTo-Json -Compress
  exit 1
}
`;
export function runWindowsOcr(
  tiles: string[],
  signal: AbortSignal,
): Promise<{
  language: string;
  results: { lines: { text: string; y: number; height: number }[] }[];
}> {
  if (process.platform !== "win32")
    throw new Error("图片识字目前支持 Windows 10/11 桌面端。");
  if (signal.aborted) return Promise.reject(new Error("已取消识别。"));
  const env = Object.fromEntries(
    ["SystemRoot", "WINDIR", "TEMP", "TMP"].flatMap((key) =>
      process.env[key] ? [[key, process.env[key]!]] : [],
    ),
  );
  const executable = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  return new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        Buffer.from(windowsOcrScript, "utf16le").toString("base64"),
      ],
      { windowsHide: true, shell: false, env, stdio: ["pipe", "pipe", "ignore"] },
    );
    let output = "",
      done = false;
    const finish = (error?: Error, result?: any) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      child.kill();
      if (error) reject(error);
      else resolve(result);
    };
    const cancel = () => finish(new Error("已取消识别。"));
    const timer = setTimeout(
      () => finish(new Error("识别超时，请缩小图片后重试。")),
      45000,
    );
    signal.addEventListener("abort", cancel, { once: true });
    child.on("error", () => finish(new Error("Windows 识字服务无法启动。")));
    child.stdin.on("error", () => finish(new Error("Windows 识字服务已停止。")));
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 512000)
        finish(new Error("识别文字过多，请分批处理。"));
    });
    child.on("close", () => {
      try {
        const value = JSON.parse(output.replace(/^\uFEFF/, "").trim());
        if (!value.ok)
          throw new Error(
            value.code === "OCR_LANGUAGE_UNAVAILABLE"
              ? "系统没有可用的识字语言，请在 Windows 设置中安装中文或英文语言包。"
              : "图片识别失败，请换一张清晰的 PNG/JPG 图片重试。",
          );
        if (
          typeof value.language !== "string" ||
          !Array.isArray(value.results) ||
          value.results.length !== tiles.length
        )
          throw new Error("识别结果格式异常。");
        finish(undefined, value);
      } catch (error) {
        finish(error instanceof Error ? error : new Error("图片识别失败。"));
      }
    });
    child.stdin.end(JSON.stringify({ tiles }));
  });
}
