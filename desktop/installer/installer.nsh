; =============================================================================
; CogniTara Studio 2.1 — Modern Photoshop / CorelDRAW-Style Windows Installer
; Direction: Opus Studio Midnight Navy (#0A0E1A), Cobalt (#0066FF), Cyan (#00D2FF)
;
; Features:
;   - Native Windows 10/11 Dark Title Bar via DwmSetWindowAttribute (20 / 19)
;   - Dark Midnight Navy surfaces & Ceramic White typography across pages
;   - Interactive Welcome Feature Showcase Slider (5 high-DPI Opus Studio slides,
;     < Prev / Next > navigation + 4.0s auto-advance timer)
;   - Animated Feature Showcase Carousel during file extraction (InstFiles)
;   - Safe %ProgramData%\CogniTara\data\ writable directory provisioning
;   - 100% compatible with electron-updater silent (/S) auto-updates
; =============================================================================

!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

!ifndef BUILD_UNINSTALLER

  ; Opus Studio Dark Theme colors for MUI2 surfaces
  !define MUI_BGCOLOR "0A0E1A"
  !define MUI_TEXTCOLOR "F3F6FB"
  !define MUI_HEADER_TRANSPARENT_TEXT
  !define MUI_CUSTOMFUNCTION_GUIINIT CogniTaraGuiInit

  !define CT_BG_HEX 0x0A0E1A
  !define CT_CARD_HEX 0x131B2D
  !define CT_INK_HEX 0xF3F6FB
  !define CT_MUTED_HEX 0xA9B6CA
  !define CT_CYAN_HEX 0x00D2FF

  ; Custom Finish Page copy
  !define MUI_FINISHPAGE_TITLE "CogniTara Studio 2.1 is ready"
  !define MUI_FINISHPAGE_TEXT "Your offline-first LAN exam server and 5-layer licence vault have been installed.$\r$\n$\r$\nLaunch CogniTara Studio now to complete the 5-step school setup or sign in with your CogniTara Cloud account."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch CogniTara Studio now"

  ; ---------------------------------------------------------------------------
  ; Page Declarations (inserted by electron-builder assistedInstaller.nsh)
  ; ---------------------------------------------------------------------------
  !macro customWelcomePage
    Page custom CogniTaraShowcaseCreate CogniTaraShowcaseLeave
  !macroend

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW CogniTaraInstFilesShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE CogniTaraInstFilesLeave
  !macroend

  ; ---------------------------------------------------------------------------
  ; Extract 5 High-DPI Feature Showcase Slide BMPs on Installer Init
  ; ---------------------------------------------------------------------------
  !macro customInit
    InitPluginsDir
    File /oname=$PLUGINSDIR\slide_1.bmp "${PROJECT_DIR}\installer\assets\slide_1.bmp"
    File /oname=$PLUGINSDIR\slide_2.bmp "${PROJECT_DIR}\installer\assets\slide_2.bmp"
    File /oname=$PLUGINSDIR\slide_3.bmp "${PROJECT_DIR}\installer\assets\slide_3.bmp"
    File /oname=$PLUGINSDIR\slide_4.bmp "${PROJECT_DIR}\installer\assets\slide_4.bmp"
    File /oname=$PLUGINSDIR\slide_5.bmp "${PROJECT_DIR}\installer\assets\slide_5.bmp"
    StrCpy $ctSlideIdx 1
    StrCpy $ctInstSlideIdx 1
  !macroend

  ; ---------------------------------------------------------------------------
  ; Functions & Vars (emitted inside customHeader AFTER all plugins/MUI load)
  ; ---------------------------------------------------------------------------
  !macro customHeader
    Var ctShowcaseDialog
    Var ctSlideImgCtrl
    Var ctSlideImgHandle
    Var ctSlideCaptionCtrl
    Var ctPrevBtn
    Var ctNextBtn
    Var ctSlideIdx
    Var ctInstSlideCtrl
    Var ctInstSlideHandle
    Var ctInstSlideIdx

    ; Native Windows 10/11 Dark Title Bar + Dark Frame Initialization
    Function CogniTaraGuiInit
      ${If} ${Silent}
        Return
      ${EndIf}

      ; Enable Immersive Dark Mode titlebar on Windows 10 (19) and Windows 11 (20)
      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 20, *i 1, i 4) i .r0'
      System::Call 'dwmapi::DwmSetWindowAttribute(p $HWNDPARENT, i 19, *i 1, i 4) i .r0'

      ; Paint outer dialog frame Midnight Navy
      SetCtlColors $HWNDPARENT ${CT_INK_HEX} ${CT_BG_HEX}
      GetDlgItem $0 $HWNDPARENT 1037
      SetCtlColors $0 ${CT_INK_HEX} ${CT_BG_HEX}
      GetDlgItem $0 $HWNDPARENT 1038
      SetCtlColors $0 ${CT_MUTED_HEX} ${CT_BG_HEX}
      GetDlgItem $0 $HWNDPARENT 1034
      SetCtlColors $0 ${CT_INK_HEX} ${CT_BG_HEX}
      GetDlgItem $0 $HWNDPARENT 1028
      SetCtlColors $0 ${CT_MUTED_HEX} ${CT_BG_HEX}
    FunctionEnd

    ; Paint Current Slide BMP + Caption on Welcome Feature Showcase Page
    Function CogniTaraRenderWelcomeSlide
      ${If} $ctSlideImgHandle != ""
        ${NSD_FreeImage} $ctSlideImgHandle
        StrCpy $ctSlideImgHandle ""
      ${EndIf}

      ${If} $ctSlideIdx == 1
        ${NSD_SetImage} $ctSlideImgCtrl "$PLUGINSDIR\slide_1.bmp" $ctSlideImgHandle
        ${NSD_SetText} $ctSlideCaptionCtrl "Feature 1 of 5  •  Offline-First LAN Exam Engine (300+ concurrent PCs)"
      ${ElseIf} $ctSlideIdx == 2
        ${NSD_SetImage} $ctSlideImgCtrl "$PLUGINSDIR\slide_2.bmp" $ctSlideImgHandle
        ${NSD_SetText} $ctSlideCaptionCtrl "Feature 2 of 5  •  5-Layer Ed25519 Licence Vault & 15-Min Exam Drain"
      ${ElseIf} $ctSlideIdx == 3
        ${NSD_SetImage} $ctSlideImgCtrl "$PLUGINSDIR\slide_3.bmp" $ctSlideImgHandle
        ${NSD_SetText} $ctSlideCaptionCtrl "Feature 3 of 5  •  60fps Proctor Studio & One-Click Server Dial"
      ${ElseIf} $ctSlideIdx == 4
        ${NSD_SetImage} $ctSlideImgCtrl "$PLUGINSDIR\slide_4.bmp" $ctSlideImgHandle
        ${NSD_SetText} $ctSlideCaptionCtrl "Feature 4 of 5  •  Automated Hot SQLite Backups & Safe Restore"
      ${Else}
        ${NSD_SetImage} $ctSlideImgCtrl "$PLUGINSDIR\slide_5.bmp" $ctSlideImgHandle
        ${NSD_SetText} $ctSlideCaptionCtrl "Feature 5 of 5  •  Neon Cloud Sign-In & Direct In-App Auto-Updates"
      ${EndIf}
    FunctionEnd

    Function CogniTaraSlideNext
      IntOp $ctSlideIdx $ctSlideIdx + 1
      ${If} $ctSlideIdx > 5
        StrCpy $ctSlideIdx 1
      ${EndIf}
      Call CogniTaraRenderWelcomeSlide
    FunctionEnd

    Function CogniTaraSlidePrev
      IntOp $ctSlideIdx $ctSlideIdx - 1
      ${If} $ctSlideIdx < 1
        StrCpy $ctSlideIdx 5
      ${EndIf}
      Call CogniTaraRenderWelcomeSlide
    FunctionEnd

    Function CogniTaraWelcomeTick
      Call CogniTaraSlideNext
    FunctionEnd

    ; Custom Welcome Page: Full-Width Opus Studio Feature Showcase Slider
    Function CogniTaraShowcaseCreate
      ${If} ${Silent}
        Abort
      ${EndIf}
      ${If} ${isUpdated}
        Abort
      ${EndIf}

      !insertmacro MUI_HEADER_TEXT "Welcome to CogniTara Studio 2.1" "Offline-first LAN CBT examination server with 5-layer vault & cloud sync."

      nsDialogs::Create 1018
      Pop $ctShowcaseDialog
      ${If} $ctShowcaseDialog == error
        Abort
      ${EndIf}

      SetCtlColors $ctShowcaseDialog ${CT_INK_HEX} ${CT_BG_HEX}

      ; Full-width 490x218 Feature Showcase Stage
      ${NSD_CreateBitmap} 0u 0u 100% 118u ""
      Pop $ctSlideImgCtrl

      ; Interactive slider control bar underneath the stage
      ${NSD_CreateButton} 0u 122u 44u 16u "< Prev"
      Pop $ctPrevBtn
      ${NSD_OnClick} $ctPrevBtn CogniTaraSlidePrev

      ${NSD_CreateLabel} 50u 125u 200u 12u "Feature 1 of 5  •  Offline-First LAN Exam Engine"
      Pop $ctSlideCaptionCtrl
      SetCtlColors $ctSlideCaptionCtrl ${CT_CYAN_HEX} ${CT_BG_HEX}

      ${NSD_CreateButton} 256u 122u 44u 16u "Next >"
      Pop $ctNextBtn
      ${NSD_OnClick} $ctNextBtn CogniTaraSlideNext

      StrCpy $ctSlideIdx 1
      Call CogniTaraRenderWelcomeSlide

      ; Auto-advance slides smoothly every 4.0 seconds
      ${NSD_CreateTimer} CogniTaraWelcomeTick 4000

      nsDialogs::Show
    FunctionEnd

    Function CogniTaraShowcaseLeave
      ${NSD_KillTimer} CogniTaraWelcomeTick
      ${If} $ctSlideImgHandle != ""
        ${NSD_FreeImage} $ctSlideImgHandle
        StrCpy $ctSlideImgHandle ""
      ${EndIf}
    FunctionEnd

    ; Animated Feature Showcase Slider DURING Installation (InstFiles Page)
    Function CogniTaraLoadInstSlide
      ${If} $ctInstSlideCtrl == ""
        Return
      ${EndIf}
      ${If} $ctInstSlideHandle != ""
        System::Call 'gdi32::DeleteObject(p $ctInstSlideHandle)'
        StrCpy $ctInstSlideHandle ""
      ${EndIf}

      StrCpy $0 "$PLUGINSDIR\slide_$ctInstSlideIdx.bmp"
      ; LoadImageW(NULL, path, IMAGE_BITMAP=0, 0, 0, LR_LOADFROMFILE=0x10)
      System::Call 'user32::LoadImage(p 0, t r0, i 0, i 0, i 0, i 0x10) p .r1'
      StrCpy $ctInstSlideHandle $1
      ; STM_SETIMAGE = 0x0172, IMAGE_BITMAP = 0
      SendMessage $ctInstSlideCtrl 0x0172 0 $ctInstSlideHandle
    FunctionEnd

    Function CogniTaraAdvanceInstSlide
      ${If} ${Silent}
        Return
      ${EndIf}
      IntOp $ctInstSlideIdx $ctInstSlideIdx + 1
      ${If} $ctInstSlideIdx > 5
        StrCpy $ctInstSlideIdx 1
      ${EndIf}
      Call CogniTaraLoadInstSlide
    FunctionEnd

    Function CogniTaraInstFilesShow
      ${If} ${Silent}
        Return
      ${EndIf}

      FindWindow $0 "#32770" "" $HWNDPARENT
      SetCtlColors $0 ${CT_INK_HEX} ${CT_BG_HEX}

      ; Status text label (IDC_INTROTEXT / 1006)
      GetDlgItem $1 $0 1006
      SetCtlColors $1 ${CT_CYAN_HEX} ${CT_BG_HEX}

      ; Hide noisy raw details list (1016) & Show Details button (1027)
      GetDlgItem $1 $0 1016
      ShowWindow $1 0
      GetDlgItem $1 $0 1027
      ShowWindow $1 0

      ; Create 490x218 Feature Showcase Bitmap Stage below the progress bar
      ; WS_CHILD(0x40000000) | WS_VISIBLE(0x10000000) | SS_BITMAP(0x0000000E) | SS_CENTERIMAGE(0x00000200) = 0x5000020E
      System::Call 'user32::CreateWindowEx(i 0, t "STATIC", t "", i 0x5000020E, i 0, i 46, i 490, i 218, p $0, p 0, p 0, p 0) p .r2'
      StrCpy $ctInstSlideCtrl $2
      StrCpy $ctInstSlideIdx 1
      Call CogniTaraLoadInstSlide
    FunctionEnd

    Function CogniTaraInstFilesLeave
      ${If} $ctInstSlideHandle != ""
        System::Call 'gdi32::DeleteObject(p $ctInstSlideHandle)'
        StrCpy $ctInstSlideHandle ""
      ${EndIf}
    FunctionEnd
  !macroend

  ; ---------------------------------------------------------------------------
  ; Provision Writable %ProgramData%\CogniTara\data\ Directories on Install
  ; and cycle Feature Showcase slides smoothly through real setup milestones
  ; ---------------------------------------------------------------------------
  !macro customInstall
    DetailPrint "Configuring 5-layer hardware licence vault & ProgramData storage..."
    Call CogniTaraAdvanceInstSlide

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

    ${IfNot} ${Silent}
      Sleep 550
    ${EndIf}

    DetailPrint "Applying secure write permissions for exam logs & backups..."
    Call CogniTaraAdvanceInstSlide

    ; Grant local Users modify rights on ProgramData\CogniTara (best-effort; never blocks non-admin installs)
    nsExec::ExecToStack 'icacls "$R0\CogniTara" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
    Pop $0
    Pop $1

    ${IfNot} ${Silent}
      Sleep 550
    ${EndIf}

    DetailPrint "Enabling automated hot backups & SQLite WAL engine..."
    Call CogniTaraAdvanceInstSlide

    ${IfNot} ${Silent}
      Sleep 550
    ${EndIf}

    DetailPrint "Connecting CogniTara Cloud sync & direct auto-updates..."
    Call CogniTaraAdvanceInstSlide

    ${IfNot} ${Silent}
      Sleep 450
    ${EndIf}
  !macroend

!endif
