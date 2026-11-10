param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('word', 'indesign')]
  [string]$Target,
  [Parameter(Mandatory = $true)]
  [string]$PayloadPath
)

$ErrorActionPreference = 'Stop'

# Windows PowerShell 5.1 may use the system OEM code page for redirected stdout.
# Electron reads this stream as UTF-8, so explicitly align the encodings to preserve Persian messages.
$script:QuranUtf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $script:QuranUtf8
$OutputEncoding = $script:QuranUtf8

function Write-Result([bool]$Ok, [string]$Message) {
  $result = @{ ok = $Ok; message = $Message } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine("QURAN_RESULT:$result")
}

function Initialize-QuranComNative {
  if ('QuranComNative' -as [type]) { return }

  $source = @'
using System;
using System.Runtime.InteropServices;
public static class QuranComNative {
    [DllImport("oleaut32.dll", PreserveSig = true)]
    public static extern int GetActiveObject(
        ref Guid rclsid,
        IntPtr reserved,
        [MarshalAs(UnmanagedType.IUnknown)] out object ppunk
    );
}
'@
  Add-Type -TypeDefinition $source -Language CSharp
}

function ConvertTo-NormalizedExePath([string]$CommandLine) {
  if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $null }
  $expanded = [Environment]::ExpandEnvironmentVariables($CommandLine.Trim())
  $exePath = $null

  if ($expanded -match '^\s*"(?<path>[^"]+\.exe)"') {
    $exePath = $Matches.path
  }
  elseif ($expanded -match '^\s*(?<path>.+?\.exe)(?:\s|$)') {
    $exePath = $Matches.path.Trim('"')
  }

  if ([string]::IsNullOrWhiteSpace($exePath)) { return $null }
  try { return [IO.Path]::GetFullPath($exePath).TrimEnd('\') } catch { return $exePath.TrimEnd('\') }
}

function Get-ComRegistrationCandidates(
  [string]$BaseProgId,
  [string]$ProcessName
) {
  $runningPaths = @()
  Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      if (-not [string]::IsNullOrWhiteSpace($_.Path)) {
        $runningPaths += [IO.Path]::GetFullPath($_.Path).TrimEnd('\')
      }
    }
    catch { }
  }

  # Discover registered ProgIDs at runtime instead of maintaining a list of release years.
  # The version-independent ProgID is always considered first; versioned ProgIDs are discovered
  # from the registry and matched to the executable path of the running application when possible.
  $progIds = @($BaseProgId)
  $prefix = "$BaseProgId."
  try {
    $progIds += [Microsoft.Win32.Registry]::ClassesRoot.GetSubKeyNames() |
    Where-Object { $_.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) } |
    Sort-Object
  }
  catch { }

  $candidates = @()
  foreach ($progId in ($progIds | Select-Object -Unique)) {
    try {
      $progKey = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey("$progId\CLSID")
      if ($null -eq $progKey) { continue }
      $clsidText = [string]$progKey.GetValue('')
      $progKey.Close()
      if ([string]::IsNullOrWhiteSpace($clsidText)) { continue }

      $comType = [Type]::GetTypeFromProgID($progId, $false)
      if ($null -eq $comType) { continue }
      $clsid = [Guid]$clsidText

      $serverPath = $null
      $serverKey = [Microsoft.Win32.Registry]::ClassesRoot.OpenSubKey("CLSID\{$clsid}\LocalServer32")
      if ($null -ne $serverKey) {
        $serverPath = ConvertTo-NormalizedExePath ([string]$serverKey.GetValue(''))
        $serverKey.Close()
      }

      $matchesRunningProcess = $false
      foreach ($runningPath in $runningPaths) {
        if ($serverPath -and [string]::Equals($serverPath, $runningPath, [StringComparison]::OrdinalIgnoreCase)) {
          $matchesRunningProcess = $true
          break
        }
      }

      $candidates += [pscustomobject]@{
        ProgId                = $progId
        Clsid                 = $clsid
        ComType               = $comType
        ServerPath            = $serverPath
        MatchesRunningProcess = $matchesRunningProcess
      }
    }
    catch { }
  }

  return @($candidates | Sort-Object `
    @{ Expression = { if ($_.MatchesRunningProcess) { 0 } elseif ($_.ProgId -eq $BaseProgId) { 1 } else { 2 } } }, `
    @{ Expression = { $_.ProgId } })
}

function Get-ComApplication(
  [string]$BaseProgId,
  [string]$ProcessName,
  [string]$ApplicationName
) {
  Initialize-QuranComNative
  $runningProcesses = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
  if ($runningProcesses.Count -eq 0) {
    throw "$ApplicationName يُرجى فتح مستند أولاً"
  }

  $candidates = @(Get-ComRegistrationCandidates -BaseProgId $BaseProgId -ProcessName $ProcessName)
  if ($candidates.Count -eq 0) {
    throw "لم يتم العثور على تسجيل $ApplicationName. يُرجى التحقق من تثبيت التطبيق أو إصلاحِ"
  }

  $attempts = New-Object System.Collections.Generic.List[string]
  $checkedClsids = @{}
  $beforeProcessIds = @($runningProcesses | ForEach-Object { $_.Id })

  # First attach to an already-running automation object if the application published one in ROT.
  foreach ($candidate in $candidates) {
    $clsidKey = $candidate.Clsid.ToString('D')
    if ($checkedClsids.ContainsKey($clsidKey)) { continue }
    $checkedClsids[$clsidKey] = $true

    try {
      $application = $null
      $clsid = [Guid]$candidate.Clsid
      $hr = [QuranComNative]::GetActiveObject([ref]$clsid, [IntPtr]::Zero, [ref]$application)
      if ($hr -eq 0 -and $null -ne $application) {
        return $application
      }
      $attempts.Add((('{0}: ROT HRESULT 0x{1:X8}' -f $candidate.ProgId, ([long]$hr -band 0xFFFFFFFFL))))
    }
    catch {
      $attempts.Add("$($candidate.ProgId): ROT $($_.Exception.Message)")
    }
  }

  # InDesign may be running without exposing its object through ROT. In that case COM activation
  # is the supported automation entry point (CreateObject/New-Object -ComObject equivalent).
  # The process must already be running; we never intentionally start a closed application here.
  $activationCandidates = @($candidates | Sort-Object `
    @{ Expression = { if ($_.MatchesRunningProcess) { 0 } elseif ($_.ProgId -eq $BaseProgId) { 1 } else { 2 } } })

  foreach ($candidate in $activationCandidates) {
    $application = $null
    try {
      $application = [Activator]::CreateInstance($candidate.ComType)
    }
    catch {
      $attempts.Add("$($candidate.ProgId): COM activation $($_.Exception.Message)")
      continue
    }

    if ($null -ne $application) {
      $afterProcessIds = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
      $newProcessIds = @($afterProcessIds | Where-Object { $beforeProcessIds -notcontains $_ })
      if ($newProcessIds.Count -gt 0) {
        $documentCount = -1
        try { $documentCount = [int]$application.Documents.Count } catch { }
        if ($documentCount -eq 0) {
          try { $application.Quit() } catch { }
        }
        throw "تأکد من فتح مستند $ApplicationName "
      }
      return , $application
    }
    $attempts.Add("$($candidate.ProgId): COM activation returned an empty object")
  }

  $attemptText = $attempts -join '; '
  throw "تعذّر إنشاء الاتصال مع $ApplicationName. التفاصيل: $attemptText"
}

try {
  if (-not (Test-Path -LiteralPath $PayloadPath -PathType Leaf)) {
    throw 'لم يتم العثور على بيانات الآية اللازمة لإدراج الهامش'
  }

  $payloadJson = [System.IO.File]::ReadAllText($PayloadPath, [System.Text.Encoding]::UTF8)
  $payload = $payloadJson | ConvertFrom-Json
  $ayahText = [string]$payload.text
  $referenceText = [string]$payload.reference

  if ([string]::IsNullOrWhiteSpace($ayahText) -or [string]::IsNullOrWhiteSpace($referenceText)) {
    throw 'نص الآية أو مرجعها فارغ'
  }

  if ($Target -eq 'word') {
    # Word's version-independent ProgID is stable across Office releases. The registry scan
    # also handles installations that expose only a versioned ProgID.
    $word = Get-ComApplication -BaseProgId 'Word.Application' -ProcessName 'WINWORD' 

    if ($word.Documents.Count -lt 1) {
      throw 'افتح مستند وُرد أولاً'
    }

    $document = $word.ActiveDocument
    if ($null -eq $document) {
      throw 'لم يتم العثور على مستند Word حاول مرة أخرى'
    }

    $selection = $word.Selection
    $range = $selection.Range
    $start = [int]$range.Start

    # Replace selected text (if any), then add a native numbered footnote immediately after it.
    $range.Text = $ayahText
    $end = $start + $ayahText.Length
    $footnoteRange = $document.Range($end, $end)
    $null = $document.Footnotes.Add($footnoteRange, [Type]::Missing, $referenceText)

    $word.Activate() | Out-Null
    Write-Result $true 'تم إدراج الهامش في Word'
    exit 0
  }

  if ($Target -eq 'indesign') {
    $indesign = Get-ComApplication -BaseProgId 'InDesign.Application' -ProcessName 'InDesign'

    if ($indesign.Documents.Count -lt 1) {
      throw ' افتح انديزاين أولاً'
    }

    $activeDocument = $indesign.ActiveDocument
    if ($null -eq $activeDocument) {
      throw 'لم يتم النسخ حاول مرة أخرى'
    }

    # Execute ExtendScript inside the connected InDesign instance; no external plug-in is required.
    $payloadLiteral = $payloadJson
    $payloadLiteral = $payloadLiteral.Replace([string][char]0x2028, '\u2028').Replace([string][char]0x2029, '\u2029')
    $jsx = @"
var quranPayload = $payloadLiteral;
app.doScript(function () {
    if (app.documents.length < 1) {
        throw new Error('لا يوجد مستند مفتوح في انديزاين');
    }
    if (!app.selection || app.selection.length < 1) {
        throw new Error('في انديزاين غير محدد النص');
    }

    var target = app.selection[0];
    var story = null;
    var startIndex = -1;
    var targetType = '';
    try { targetType = target && target.constructor ? target.constructor.name : ''; } catch (_) {}

    var isInsertionPoint = targetType === 'InsertionPoint';
    if (!isInsertionPoint) {
        try { isInsertionPoint = !!(target && target.parentStory && typeof target.index === 'number'); } catch (_) {}
    }

    var isTextRange = targetType === 'Text' || targetType === 'TextStyleRange' || targetType === 'Word' || targetType === 'Character';
    if (!isTextRange) {
        try { isTextRange = !!(target && target.parentStory && target.insertionPoints && target.insertionPoints.length > 0); } catch (_) {}
    }

    if (isInsertionPoint) {
        story = target.parentStory;
        startIndex = target.index;
        target.contents = quranPayload.text;
    } else if (isTextRange) {
        story = target.parentStory;
        startIndex = target.insertionPoints[0].index;
        target.contents = quranPayload.text;
    } else {
        throw new Error('ليس نصاً قابلاً للتحرير');
    }

    if (!story || startIndex < 0) {
        throw new Error('تعذّر تحديد موضع إدراج النص في انديزاين');
    }

    var endPoint = story.insertionPoints.item(startIndex + quranPayload.text.length);
    var footnote = endPoint.footnotes.add();
    footnote.insertionPoints[-1].contents = quranPayload.reference;
}, ScriptLanguage.JAVASCRIPT, undefined, UndoModes.ENTIRE_SCRIPT, 'Insert Quran footnote');
"@

    $null = $indesign.DoScript([string]$jsx, 1246973031)
    Write-Result $true 'تم إدراج الهامش في انديزاين'
    exit 0
  }
  throw 'التطبيق المستهدف غير مدعوم'
}
catch {
  $message = $_.Exception.Message
  if (
    $message -match 'Object reference not set to an instance of an object|NullReferenceException'
  ) {
    $message = 'يرجى تحديد إطار نص أو موضع إدراج صالح أولاً.'
  }

  if ([string]::IsNullOrWhiteSpace($message)) {
    $message = 'حدث خطأ غير متوقع.'
  }

  Write-Result $false $message
}
