; Folio's installation and removal share the application's identity and language.
#ifndef AppVersion
  #error AppVersion must be passed by scripts/build-installer.cjs
#endif
#ifndef ApplicationDir
  #define ApplicationDir RepoRoot + "\out\Folio-win32-x64"
#endif
#ifdef TestMode
  #define Identity "Folio.Journey.Acceptance"
  #define InstallFolder RepoRoot + "\out\journey-design\installed"
  #define OutputFolder RepoRoot + "\out\journey-design\installer"
  #define OutputName "Folio-" + AppVersion + "-Acceptance-Setup"
  #define ProgId "Folio.Journey.Document"
#else
  #define Identity "Folio.Desktop"
  #define InstallFolder "{localappdata}\Programs\Folio"
  #define OutputFolder RepoRoot + "\out\make\folio.windows\x64"
  #define OutputName "Folio-" + AppVersion + " Setup"
  #define ProgId "Folio.Document"
#endif

[Setup]
AppId={#Identity}
AppName=Folio · 轻页
AppVersion={#AppVersion}
AppVerName=Folio · 轻页 {#AppVersion}
AppPublisher=Folio Contributors
DefaultDirName={#InstallFolder}
DefaultGroupName=Folio · 轻页
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputFolder}
OutputBaseFilename={#OutputName}
Compression=lzma2/fast
SolidCompression=yes
SetupIconFile={#RepoRoot}\assets\folio.ico
UninstallDisplayIcon={app}\resources\folio.ico
UninstallDisplayName=Folio · 轻页
WizardStyle=modern dynamic windows11
WizardBackColor=#faf9f6
WizardBackColorDynamicDark=#232625
WizardImageFile={#RepoRoot}\assets\folio-mark.png
WizardSmallImageFile={#RepoRoot}\assets\folio-mark.png
WizardImageBackColor=#faf9f6
WizardImageBackColorDynamicDark=#232625
WizardSmallImageBackColor=#faf9f6
WizardSmallImageBackColorDynamicDark=#232625
WizardSizePercent=110,110
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
UsePreviousTasks=yes
CloseApplications=yes
RestartApplications=no
AppMutex=Folio.Desktop.Installation
#ifndef TestMode
ChangesAssociations=yes
#endif
VersionInfoProductName=Folio
VersionInfoDescription=Folio · 轻页 安装程序

[Languages]
Name: chinesesimp; MessagesFile: "{#RepoRoot}\assets\installer\ChineseSimplified.isl"

[Messages]
SetupWindowTitle=安装 · Folio 轻页
WelcomeLabel1=欢迎使用轻页
WelcomeLabel2=安静地写，清楚地表达。%n%n在本机安装 Folio，直接写 Markdown，按需导出 PDF 或 Word。无需账号。%n%n安装和升级会保留已有的排版偏好、Word 模板和恢复草稿。文稿保存在你选择的位置。
SelectDirLabel3=选择程序的安装位置。文稿、设置与恢复草稿存放在独立位置，升级时会继续保留。
ReadyLabel1=准备好后，点击“安装轻页”。取消不会改动你的文稿、设置或模板。
ReadyLabel2a=点击“安装轻页”继续，或使用“上一步”调整安装位置和快捷方式。
ReadyLabel2b=点击“安装轻页”继续。
FinishedHeadingLabel=轻页已准备好
FinishedLabelNoIcons=现在可以开始写作。%n%n请用 Ctrl+S 保存文稿；完整使用说明可在应用中按 F1 查看。
FinishedLabel=现在可以开始写作。%n%n请用 Ctrl+S 保存文稿；完整使用说明可在应用中按 F1 查看。
UninstallAppFullTitle=卸载 · Folio 轻页
ConfirmUninstall=要卸载轻页吗？%n%n将移除程序、快捷方式和本版本的打开方式入口。你的 Markdown 文稿、图片附件、排版设置、Word 模板和恢复草稿会保留。%n%n重新安装后可继续使用已有资料。
UninstallStatusLabel=正在移除轻页程序。你的文稿、设置、模板和恢复草稿会保留。
UninstalledAll=轻页已卸载。%n%n你的文稿、设置、模板和恢复草稿仍保留在原位置。重新安装后可以继续使用。
ButtonNext=继续(&N) >
ButtonBack=< 上一步(&B)
ButtonInstall=安装轻页(&I)
ButtonFinish=完成(&F)
ButtonCancel=取消
ClickNext=点击“继续”进入下一步，或点击“取消”退出安装。
SelectDirBrowseLabel=点击“继续”使用此位置，或点击“浏览”选择其他文件夹。
SelectTasksLabel2=选择需要的快捷方式，然后点击“继续”。
ExitSetupTitle=取消安装
ExitSetupMessage=要取消这次安装吗？%n%n安装尚未完成，取消后可随时重新运行安装包。你的文稿、设置和模板会保留。

[Tasks]
Name: desktopicon; Description: "在桌面创建轻页快捷方式"; Flags: unchecked

[Files]
Source: "{#ApplicationDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
#ifdef TestMode
Name: "{app}\验收快捷方式\Folio · 轻页"; Filename: "{app}\Folio.exe"; Parameters: "--user-data-dir=""{#RepoRoot}\out\journey-design\installed-profile"""; IconFilename: "{app}\resources\folio.ico"; AppUserModelID: "Folio.Journey.Acceptance"
#else
Name: "{group}\Folio · 轻页"; Filename: "{app}\Folio.exe"; IconFilename: "{app}\resources\folio.ico"; AppUserModelID: "com.squirrel.markdown_editor_v1.Folio"
Name: "{userdesktop}\Folio · 轻页"; Filename: "{app}\Folio.exe"; IconFilename: "{app}\resources\folio.ico"; Tasks: desktopicon; AppUserModelID: "com.squirrel.markdown_editor_v1.Folio"
#endif

[Registry]
Root: HKCU; Subkey: "Software\Classes\{#ProgId}"; ValueType: string; ValueData: "Folio Markdown 文稿"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\{#ProgId}\DefaultIcon"; ValueType: string; ValueData: """{app}\resources\folio.ico"""
Root: HKCU; Subkey: "Software\Classes\{#ProgId}\shell\open\command"; ValueType: string; ValueData: """{app}\Folio.exe"" ""%1"""
#ifndef TestMode
Root: HKCU; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueName: "{#ProgId}"; ValueType: string; ValueData: ""; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueName: "{#ProgId}"; ValueType: string; ValueData: ""; Flags: uninsdeletevalue
#endif

[Run]
#ifdef TestMode
Filename: "{app}\Folio.exe"; Parameters: "--user-data-dir=""{#RepoRoot}\out\journey-design\installed-profile"""; Description: "打开轻页"; Flags: nowait postinstall skipifsilent unchecked
#else
Filename: "{app}\Folio.exe"; Description: "打开轻页"; Flags: nowait postinstall skipifsilent
#endif

[Code]
var LegacyPage: TInputOptionWizardPage; LegacyUpdater: String;
procedure InitializeWizard;
begin
  WizardForm.Font.Name := 'Microsoft YaHei UI';
  WizardForm.Font.Size := 10;
  WizardForm.WizardBitmapImage.SetBounds(ScaleX(24), ScaleY(36), ScaleX(48), ScaleY(48));
  WizardForm.WelcomeLabel1.SetBounds(ScaleX(88), ScaleY(36), WizardForm.ClientWidth - ScaleX(112), ScaleY(58));
  WizardForm.WelcomeLabel1.Font.Size := 18;
  WizardForm.WelcomeLabel1.Font.Name := 'Microsoft YaHei UI';
  WizardForm.FinishedHeadingLabel.Font.Name := 'Microsoft YaHei UI';
  WizardForm.WelcomeLabel2.Left := ScaleX(24);
  WizardForm.WelcomeLabel2.Top := ScaleY(110);
  WizardForm.WelcomeLabel2.Width := WizardForm.ClientWidth - ScaleX(48);
  WizardForm.WelcomeLabel2.Height := ScaleY(210);
  WizardForm.WizardBitmapImage2.SetBounds(ScaleX(24), ScaleY(36), ScaleX(48), ScaleY(48));
  WizardForm.FinishedHeadingLabel.Left := ScaleX(88);
  WizardForm.FinishedHeadingLabel.Top := ScaleY(36);
  WizardForm.FinishedHeadingLabel.Width := WizardForm.ClientWidth - ScaleX(112);
  WizardForm.FinishedLabel.Left := ScaleX(24);
  WizardForm.FinishedLabel.Top := ScaleY(110);
  WizardForm.FinishedLabel.Width := WizardForm.ClientWidth - ScaleX(48);
#ifndef TestMode
  LegacyUpdater := ExpandConstant('{localappdata}\markdown_editor_v1\Update.exe');
  if FileExists(LegacyUpdater) then begin
    LegacyPage := CreateInputOptionPage(wpWelcome, '发现旧版轻页', '安装后整理旧版入口',
      '新版本安装成功后，可以移除旧版程序。你的设置、模板、恢复草稿和文稿会保留。取消此次安装不会移除旧版。', False, False);
    LegacyPage.Add('安装成功后移除旧版程序（可选）');
    LegacyPage.Values[0] := False;
  end;
#endif
end;

procedure CurStepChanged(CurStep: TSetupStep);
var ResultCode: Integer;
begin
  if (CurStep = ssPostInstall) and not WizardSilent and Assigned(LegacyPage) and LegacyPage.Values[0] then begin
    if not Exec(LegacyUpdater, '--uninstall -s', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) or (ResultCode <> 0) then
      MsgBox('新版已安装，旧版程序暂未移除。请在 Windows“已安装的应用”中卸载旧版。文稿、设置和模板会保留。', mbInformation, MB_OK);
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var Destination, LegacyRoot: String;
begin
  Result := '';
#ifndef TestMode
  if FileExists(LegacyUpdater) then begin
    Destination := AddBackslash(Lowercase(ExpandFileName(WizardDirValue)));
    LegacyRoot := AddBackslash(Lowercase(ExtractFileDir(LegacyUpdater)));
    if Pos(LegacyRoot, Destination) = 1 then
      Result := '请选择与旧版不同的安装位置。建议使用默认的 Programs\Folio 文件夹，以便安装成功后安全整理旧版入口。';
  end;
#endif
end;

procedure InitializeUninstallProgressForm;
begin
  UninstallProgressForm.Font.Name := 'Microsoft YaHei UI';
  UninstallProgressForm.Font.Size := 10;
end;

#ifdef TestMode
// Test-only CLI driver follows the real wizard's default Next/Install path.
// The production installer does not contain this driver.
function AcceptanceSetTimer(hWnd, nIDEvent, uElapse, lpTimerFunc: Longword): Longword;
external 'SetTimer@user32.dll stdcall';
function AcceptanceKillTimer(hWnd, uIDEvent: Longword): Boolean;
external 'KillTimer@user32.dll stdcall';
var AcceptancePage: Integer; AcceptanceTimer: Longword;
procedure AcceptanceAdvance(Arg1, Arg2, Arg3, Arg4: Longword);
begin
  if (AcceptancePage = wpFinished) then begin
    AcceptanceKillTimer(0, AcceptanceTimer);
    if WizardForm.NextButton.Enabled then WizardForm.NextButton.OnClick(WizardForm.NextButton);
  end
  else if WizardForm.NextButton.Enabled and
    ((AcceptancePage = wpWelcome) or (AcceptancePage = wpSelectDir) or
     (AcceptancePage = wpSelectTasks) or (AcceptancePage = wpReady)) then
    WizardForm.NextButton.OnClick(WizardForm.NextButton);
end;
procedure CurPageChanged(CurPageID: Integer);
begin
  AcceptancePage := CurPageID;
end;
<event('InitializeWizard')>
procedure InitializeAcceptanceDriver;
begin
  if ExpandConstant('{param:FolioAcceptanceInstall|0}') = '1' then
    AcceptanceTimer := AcceptanceSetTimer(0, 0, 1000, CreateCallback(@AcceptanceAdvance));
end;
#endif
