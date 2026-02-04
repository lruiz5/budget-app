; Budget App Installer Script for Inno Setup
; Download Inno Setup from: https://jrsoftware.org/isinfo.php

#define MyAppName "Budget App"
#define MyAppVersion "1.7.0"
#define MyAppPublisher "Budget App"
#define MyAppURL "https://github.com/your-repo/budget-app"
#define MyAppExeName "start.bat"

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
AppId={{B8D6E4F2-1A3C-4D5E-9F0A-2B3C4D5E6F7A}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Output settings
OutputDir=..\dist
OutputBaseFilename=BudgetApp-{#MyAppVersion}-Setup
; Compression
Compression=lzma2/ultra64
SolidCompression=yes
; UI settings
WizardStyle=modern
; Privileges - run as admin to install in Program Files
PrivilegesRequired=admin
; Architecture
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startupicon"; Description: "Start Budget App when Windows starts"; GroupDescription: "Startup Options:"; Flags: unchecked

[Files]
; Main application files from standalone build
Source: "..\dist\standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
; Bundled Node.js runtime
Source: "..\dist\node\node.exe"; DestDir: "{app}"; Flags: ignoreversion
; Startup scripts
Source: "start.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "stop.bat"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
; Create data directory with full permissions for the user
Name: "{app}\data"; Permissions: users-full

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Comment: "Start Budget App Server"
Name: "{group}\Stop {#MyAppName}"; Filename: "{app}\stop.bat"; WorkingDir: "{app}"; Comment: "Stop Budget App Server"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon; IconFilename: "{app}\icon.ico"
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: startupicon

[Run]
; Option to launch after install
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallRun]
; Stop server before uninstall
Filename: "{app}\stop.bat"; Flags: runhidden waituntilterminated

[Code]
// Check if port 3000 is already in use
function IsPortInUse(): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  if Exec('cmd.exe', '/c netstat -an | findstr ":3000.*LISTENING"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode = 0);
  end;
end;

function InitializeSetup(): Boolean;
begin
  Result := True;
  if IsPortInUse() then
  begin
    if MsgBox('Port 3000 appears to be in use. Another instance of Budget App or another application may be running.' + #13#10 + #13#10 + 'Continue installation anyway?', mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    // Ask user if they want to keep their data
    if MsgBox('Do you want to keep your budget data?' + #13#10 + #13#10 + 'Click Yes to keep your data (you can use it if you reinstall).' + #13#10 + 'Click No to delete all data.', mbConfirmation, MB_YESNO) = IDNO then
    begin
      DelTree(ExpandConstant('{app}\data'), True, True, True);
    end;
  end;
end;
