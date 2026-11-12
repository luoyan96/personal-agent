using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using Windows.ApplicationModel;
using Windows.ApplicationModel.Activation;
using Windows.ApplicationModel.DataTransfer;
using Windows.Storage;
using Windows.Management.Deployment;

namespace AcceptCat.ShareTarget;

internal static class Program
{
    private const long Limit = 64L * 1024 * 1024;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--register") return Register(args[1]).GetAwaiter().GetResult();
        if (args.SequenceEqual(new[] { "--unregister" })) return Unregister().GetAwaiter().GetResult();
        // Probes never accept a share, create staging files, or launch the client.
        if (args.Contains("--registration-check"))
        {
            try { return Package.Current.Id.Name == "AcceptCat.Windows.ShareTarget" ? 0 : 1; }
            catch { return 1; }
        }
        if (args.Contains("--self-test")) return SelfTest().GetAwaiter().GetResult();
        Trace("receive-start");
        SynchronizationContext.SetSynchronizationContext(new DispatcherSynchronizationContext());
        var exitCode = 0;
        Receive().ContinueWith(task =>
        {
            if (task.IsFaulted) { _ = task.Exception; exitCode = 1; }
            Dispatcher.CurrentDispatcher.BeginInvokeShutdown(DispatcherPriority.Background);
        }, TaskScheduler.FromCurrentSynchronizationContext());
        Dispatcher.Run();
        return exitCode;
    }

    private static async Task<int> Register(string installRoot)
    {
        var status = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AcceptCat", "share-registration.json");
        var enabled = false;
        string? errorCode = null;
        try
        {
            var package = Path.Combine(AppContext.BaseDirectory, "AcceptCat.ShareTarget.msix");
            var options = new AddPackageOptions { ExternalLocationUri = new Uri(Path.GetFullPath(installRoot) + Path.DirectorySeparatorChar) };
            var result = await new PackageManager().AddPackageByUriAsync(new Uri(package), options);
            enabled = result.ExtendedErrorCode is null || result.ExtendedErrorCode.HResult == 0;
            if (!enabled) errorCode = $"0x{result.ExtendedErrorCode!.HResult:X8}";
        }
        catch (Exception error) { errorCode = $"0x{error.HResult:X8}"; }
        Directory.CreateDirectory(Path.GetDirectoryName(status)!);
        await File.WriteAllTextAsync(status, JsonSerializer.Serialize(new { enabled, errorCode, reason = enabled ? "registered" : "signature-or-registration-required" }));
        return enabled ? 0 : 1;
    }

    private static async Task<int> Unregister()
    {
        try
        {
            var current = Package.Current;
            if (current.Id.Name != "AcceptCat.Windows.ShareTarget") return 1;
            var result = await new PackageManager().RemovePackageAsync(current.Id.FullName);
            return result.ExtendedErrorCode is null || result.ExtendedErrorCode.HResult == 0 ? 0 : 1;
        }
        catch { return 0; }
    }

    private static async Task Receive()
    {
        Windows.ApplicationModel.DataTransfer.ShareTarget.ShareOperation? operation = null;
        try
        {
            if (AppInstance.GetActivatedEventArgs() is not IShareTargetActivatedEventArgs activation)
                throw new InvalidOperationException("请从 Windows 分享菜单打开 AcceptCat。");
            Trace("share-activation");
            operation = activation.ShareOperation;
            operation.ReportStarted();
            if (!operation.Data.Contains(StandardDataFormats.StorageItems))
                throw new InvalidOperationException("请选择一个微信导出的 ZIP 分享包。");
            var items = await operation.Data.GetStorageItemsAsync();
            if (items.Count != 1 || items[0] is not StorageFile file ||
                !file.Name.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("本次仅接收一个 ZIP 分享包，请在聊天中另行添加其他附件。");
            var properties = await file.GetBasicPropertiesAsync();
            if (properties.Size == 0 || properties.Size > Limit)
                throw new InvalidOperationException("微信分享包须大于零且不超过 64 MiB。");
            var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AcceptCat", "ShareInbox");
            await using var source = await file.OpenStreamForReadAsync();
            var id = await Stage(root, file.Name, source);
            Trace("staged");
            operation.ReportDataRetrieved();
            var executable = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "AcceptCat.exe"));
            if (!File.Exists(executable)) throw new InvalidOperationException("未找到 AcceptCat，请重新安装客户端。");
            var start = new ProcessStartInfo(executable) { UseShellExecute = false, WorkingDirectory = Path.GetDirectoryName(executable)! };
            start.ArgumentList.Add("--acceptcat-share=" + id);
            using var process = Process.Start(start) ?? throw new InvalidOperationException("无法打开 AcceptCat。");
            operation.ReportCompleted();
            Trace("completed");
        }
        catch (Exception error)
        {
            Trace($"failed:{error.GetType().Name}:0x{error.HResult:X8}");
            var message = error is InvalidOperationException ? error.Message : "分享包未接收，请重试或在 AcceptCat 中选择 ZIP 文件导入。";
            if (operation is not null) { try { operation.ReportError(message); } catch { } }
            else MessageBox.Show(message, "AcceptCat", MessageBoxButton.OK, MessageBoxImage.Information);
        }
    }

    private static void Trace(string phase)
    {
        // Diagnostic stages only: never record archive paths, filenames, text, or credentials.
        try {
            var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "AcceptCat");
            Directory.CreateDirectory(directory);
            File.AppendAllText(Path.Combine(directory, "share-receiver.log"), $"{DateTimeOffset.UtcNow:O} {phase}\n");
        } catch { }
    }

    private static async Task<string> Stage(string root, string name, Stream source)
    {
        Directory.CreateDirectory(root);
        if (Directory.EnumerateDirectories(root).Take(33).Count() >= 32)
            throw new InvalidOperationException("待处理分享较多，请先在 AcceptCat 中处理已有分享。");
        var id = Guid.NewGuid().ToString("N");
        var temporary = Path.Combine(root, ".receiving-" + id);
        Directory.CreateDirectory(temporary);
        try
        {
            var size = 0L;
            await using (var output = new FileStream(Path.Combine(temporary, "source.zip"), FileMode.CreateNew, FileAccess.Write, FileShare.None))
            {
                var buffer = new byte[65536];
                int count;
                while ((count = await source.ReadAsync(buffer)) > 0)
                {
                    size += count;
                    if (size > Limit) throw new InvalidOperationException("分享包超过 64 MiB。");
                    await output.WriteAsync(buffer.AsMemory(0, count));
                }
                await output.FlushAsync();
            }
            if (size == 0) throw new InvalidOperationException("分享包为空。");
            await File.WriteAllTextAsync(Path.Combine(temporary, "metadata.json"),
                JsonSerializer.Serialize(new { id, name = Path.GetFileName(name), createdAt = DateTimeOffset.UtcNow }));
            Directory.Move(temporary, Path.Combine(root, id));
            return id;
        }
        catch { Directory.Delete(temporary, true); throw; }
    }

    private static async Task<int> SelfTest()
    {
        var root = Path.Combine(Path.GetTempPath(), "acceptcat-share-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            var bytes = new byte[] { 80, 75, 3, 4 };
            var id = await Stage(root, "synthetic.zip", new MemoryStream(bytes));
            if (!(await File.ReadAllBytesAsync(Path.Combine(root, id, "source.zip"))).SequenceEqual(bytes)) return 1;
            using var metadata = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root, id, "metadata.json")));
            if (metadata.RootElement.GetProperty("id").GetString() != id) return 1;
            try { await Stage(root, "empty.zip", new MemoryStream()); return 1; }
            catch (InvalidOperationException) { }
            return Directory.GetDirectories(root).Length == 1 ? 0 : 1;
        }
        finally { if (Directory.Exists(root)) Directory.Delete(root, true); }
    }
}
