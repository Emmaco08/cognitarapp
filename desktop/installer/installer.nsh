; =============================================================================
; CogniTara Studio 2.2 — NSIS installer customisations (electron-builder)
;
; Role in 2.2: this NSIS installer is the *engine* behind the new custom setup
; experience (desktop/setup, Tauri + WebView2) which runs it silently, and it is
; the package electron-updater downloads for in-app updates (also silent). The
; interactive wizard below is only seen when someone runs the NSIS .exe directly
; or on PCs without the WebView2 runtime (fallback).
;
; Design decisions (fixes for the 2.1 wizard):
;   - No bitmap carousels: the 490x218 slide bitmaps were drawn into fixed-pixel
;     controls and got clipped/scaled under high DPI. Removed entirely.
;   - Clean native *light* Windows wizard with brand sidebar (welcome/finish) and
;     header bitmaps; no half-dark frames, so every native control stays readable
;     (buttons, edit boxes, radio buttons, the finish-page checkbox).
;   - Progress bar recoloured to CogniTara Cobalt instead of the default green.
;   - Silent-mode switches used by the custom setup:
;       --no-desktop-shortcut       (electron-builder built-in, handled again here)
;       --no-start-menu-shortcut    (CogniTara: removes the Start-menu entry)
;   - %ProgramData%\CogniTara\data provisioning unchanged from 2.1.
; =============================================================================

!include "LogicLib.nsh"
!include "FileFunc.nsh"

!ifndef BUILD_UNINSTALLER

  ; Welcome / Finish page copy
  !define MUI_WELCOMEPAGE_TITLE "Welcome to CogniTara Studio Setup"
  !define MUI_WELCOMEPAGE_TEXT "This will install CogniTara Studio ${VERSION} — the offline-first LAN CBT exam server with the 5-layer licence vault — on this computer.$\r$\n$\r$\nExam data, logs and backups are stored in %ProgramData%\CogniTara and are preserved during updates.$\r$\n$\r$\nClick Next to continue."
  !define MUI_FINISHPAGE_TITLE "CogniTara Studio is ready"
  !define MUI_FINISHPAGE_TEXT "CogniTara Studio ${VERSION} has been installed on this computer.$\r$\n$\r$\nLaunch Studio to complete the 5-step school setup, or sign in with your CogniTara Cloud account."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch CogniTara Studio"

  ; Cobalt #0066FF / track #E6ECF5 as COLORREF (0x00BBGGRR)
  !define CT_PROGRESS_BAR 0x00FF6600
  !define CT_PROGRESS_BK 0x00F5ECE6

  ; ---------------------------------------------------------------------------
  ; Pages (hooks consumed by electron-builder's assistedInstaller.nsh)
  ; ---------------------------------------------------------------------------
  !macro customWelcomePage
    !define MUI_PAGE_CUSTOMFUNCTION_PRE CogniTaraSkipIfUpdated
    !insertmacro MUI_PAGE_WELCOME
  !macroend

  !macro customPageAfterChangeDir
    ; Consumed by the MUI_PAGE_INSTFILES that follows this hook.
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW CogniTaraInstFilesShow
  !macroend

  !macro customFinishPage
    ; Same launch behaviour as electron-builder's default finish page, plus a
    ; SHOW hook that guarantees a readable "Launch" checkbox.
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW CogniTaraFinishShow
    !insertmacro MUI_PAGE_FINISH

    ; Defined after MUI_PAGE_FINISH so $mui.FinishPage.Run is already declared.
    Function CogniTaraFinishShow
      ; Themed checkboxes ignore WM_CTLCOLORSTATIC text colours (the 2.1 label was
      ; dark-on-navy). Un-theme the control and set explicit ink/background colours.
      System::Call 'uxtheme::SetWindowTheme(p $mui.FinishPage.Run, w "", w "")'
      SetCtlColors $mui.FinishPage.Run 0x0A0E1A 0xFFFFFF
    FunctionEnd
  !macroend

  ; ---------------------------------------------------------------------------
  ; Functions (emitted inside customHeader, after MUI / plugins are loaded)
  ; ---------------------------------------------------------------------------
  !macro customHeader
    Function CogniTaraSkipIfUpdated
      ${if} ${isUpdated}
        Abort
      ${endif}
    FunctionEnd

    Function CogniTaraInstFilesShow
      ${If} ${Silent}
        Return
      ${EndIf}
      FindWindow $0 "#32770" "" $HWNDPARENT
      ; Progress bar (1004): drop the visual style so the bar colour applies.
      GetDlgItem $1 $0 1004
      System::Call 'uxtheme::SetWindowTheme(p r1, w "", w "")'
      SendMessage $1 0x0409 0 ${CT_PROGRESS_BAR}   ; PBM_SETBARCOLOR
      SendMessage $1 0x2001 0 ${CT_PROGRESS_BK}    ; PBM_SETBKCOLOR
    FunctionEnd
  !macroend

  ; ---------------------------------------------------------------------------
  ; Silent-mode pre-flight: stop any stray cognitara-engine.exe before files
  ; are replaced so in-app updates & repairs never hit Windows file locks.
  ; ---------------------------------------------------------------------------
  !macro customInit
    ${If} ${Silent}
      nsExec::Exec 'taskkill /F /IM cognitara-engine.exe'
      Pop $0
    ${EndIf}
  !macroend

  ; ---------------------------------------------------------------------------
  ; Install: shortcut switches + writable %ProgramData%\CogniTara\data
  ; ---------------------------------------------------------------------------
  !macro customInstall
    ${GetParameters} $R9

    ; Shortcut switches from the custom setup (ignored on electron-updater updates,
    ; where electron-builder keeps the user's existing shortcuts as they are).
    ${IfNot} ${isUpdated}
      ClearErrors
      ${GetOptions} $R9 "--no-desktop-shortcut" $R8
      ${IfNot} ${Errors}
        Delete "$newDesktopLink"
      ${EndIf}
      ClearErrors
      ${GetOptions} $R9 "--no-start-menu-shortcut" $R8
      ${IfNot} ${Errors}
        Delete "$newStartMenuLink"
        !ifdef MENU_FILENAME
          RMDir "$SMPROGRAMS\${MENU_FILENAME}"
        !endif
        StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      ${EndIf}
      ClearErrors
    ${EndIf}

    DetailPrint "Configuring CogniTara data folder in ProgramData..."
    ReadEnvStr $R0 "PROGRAMDATA"
    ${If} $R0 == ""
      StrCpy $R0 "C:\ProgramData"
    ${EndIf}

    CreateDirectory "$R0\CogniTara"
    CreateDirectory "$R0\CogniTara\data"
    CreateDirectory "$R0\CogniTara\data\logs"
    CreateDirectory "$R0\CogniTara\data\static"
    CreateDirectory "$R0\CogniTara\data\static\images"
    CreateDirectory "$R0\CogniTara\Backups"
    CreateDirectory "$R0\CogniTara\vault"

    DetailPrint "Applying write permissions for exam logs and backups..."
    ; Grant local Users modify rights on ProgramData\CogniTara (best-effort; never blocks non-admin installs)
    nsExec::ExecToStack 'icacls "$R0\CogniTara" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
    Pop $0
    Pop $1
  !macroend

!endif
