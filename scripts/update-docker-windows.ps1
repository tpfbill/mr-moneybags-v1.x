<#
.SYNOPSIS
    Automates the update process for the Nonprofit Fund Accounting application running in Docker on Windows.
.DESCRIPTION
    This PowerShell script provides a safe and reliable way to update the application. It performs the following steps:
    1. Creates a full backup of the database and application code.
    2. Pulls the latest changes from the specified GitHub branch.
    3. Rebuilds the Docker application image with the new code.
    4. Restarts the application and database containers.
    5. Verifies that the update was successful by checking container health and the application's health endpoint.
    6. If any step fails, it automatically rolls back the code and database to their previous state.
.EXAMPLE
    .\update-docker-windows.ps1
    Runs the entire update process using the default configuration defined in the script.
.EXAMPLE
    .\update-docker-windows.ps1 -GitBranch "main" -BackupPath "D:\backups\npfa"
    Runs the update process, pulling from the "main" branch and storing backups in a custom directory.
#>
[CmdletBinding()]
param (
    [string]$GitBranch = "v8.5",
    [string]$BackupPath = (Join-Path $PSScriptRoot "backups"),
    [string]$AppDir = $PSScriptRoot
)

# --- Script Configuration ---
# Stop the script immediately if any command fails
$ErrorActionPreference = "Stop"

# --- Helper Functions ---
function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )
    $ColorMap = @{
        "INFO"    = "Green"
        "WARN"    = "Yellow"
        "ERROR"   = "Red"
        "SUCCESS" = "Cyan"
    }
    $Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host -ForegroundColor $ColorMap[$Level] "[$Timestamp] [$Level] $Message"
}

# --- State Variables for Rollback ---
$Global:PreviousCommitHash = $null
$Global:DbBackupFile = $null
$Global:AppBackupFile = $null

# --- Main Logic Functions ---

function Create-Backup {
    Write-Log "Starting backup process..."
    if (-not (Test-Path -Path $BackupPath)) {
        Write-Log "Creating backup directory at '$BackupPath'."
        New-Item -ItemType Directory -Force -Path $BackupPath | Out-Null
    }

    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $Global:DbBackupFile = Join-Path $BackupPath "db_backup_$Timestamp.sql"
    $Global:AppBackupFile = Join-Path $BackupPath "app_backup_$Timestamp.zip"

    Write-Log "Backing up database to '$DbBackupFile'..."
    try {
        docker-compose exec -T db pg_dump -U postgres -d fund_accounting_db | Set-Content -Path $DbBackupFile -Encoding "Default"
        Write-Log "Database backup created successfully."
    } catch {
        throw "Failed to create database backup. Please check if Docker containers are running."
    }

    Write-Log "Backing up application directory to '$AppBackupFile'..."
    Compress-Archive -Path "$AppDir\*" -DestinationPath $AppBackupFile -Force
    Write-Log "Application backup created successfully."

    Write-Log "Cleaning up old backups (older than 30 days)..."
    Get-ChildItem -Path $BackupPath -Recurse | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force
}

function Pull-Latest-Code {
    Write-Log "Fetching latest code from GitHub branch '$GitBranch'..."
    Set-Location $AppDir

    $Global:PreviousCommitHash = git rev-parse HEAD
    Write-Log "Current version (commit): $($Global:PreviousCommitHash)"

    git fetch origin
    git reset --hard "origin/$GitBranch"
    Write-Log "Successfully pulled and checked out latest code."
}

function Update-Docker-Containers {
    Write-Log "Stopping and removing existing containers..."
    docker-compose down

    Write-Log "Rebuilding application image with new code (this may take a moment)..."
    docker-compose build --no-cache

    Write-Log "Starting updated containers in detached mode..."
    docker-compose up -d
}

function Verify-Update {
    Write-Log "Verifying update... Waiting for services to initialize."
    Start-Sleep -Seconds 15 # Give containers time to start and run health checks

    Write-Log "Checking container status..."
    $StatusOutput = docker-compose ps
    $AppStatus = ($StatusOutput | Select-String "npfa_app").ToString()
    $DbStatus = ($StatusOutput | Select-String "npfa_db").ToString()

    if (($AppStatus -notlike "*running*") -and ($AppStatus -notlike "*healthy*")) {
        throw "Application container 'npfa_app' failed to start. Current status: $AppStatus"
    }
    if (($DbStatus -notlike "*running*") -and ($DbStatus -notlike "*healthy*")) {
        throw "Database container 'npfa_db' failed to start. Current status: $DbStatus"
    }
    Write-Log "All containers are running."

    Write-Log "Checking application health endpoint..."
    $HealthUrl = "http://localhost:3000/api/health"
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing
        if ($response.StatusCode -ne 200) {
            throw "Health check failed! Application returned HTTP status $($response.StatusCode)."
        }
        Write-Log "Health check passed (HTTP $($response.StatusCode))."
    } catch {
        throw "Failed to connect to application health endpoint at $HealthUrl. Error: $($_.Exception.Message)"
    }
}

function Rollback-Changes {
    param([string]$ErrorMessage)

    Write-Log "!!! UPDATE FAILED: $ErrorMessage !!!" -Level "ERROR"
    Write-Log "--- STARTING AUTOMATIC ROLLBACK ---" -Level "WARN"

    try {
        # 1. Stop any potentially running containers
        Write-Log "Stopping containers..." -Level "WARN"
        docker-compose down | Out-Null

        # 2. Restore code from previous commit
        if ($Global:PreviousCommitHash) {
            Write-Log "Reverting code to previous commit: $($Global:PreviousCommitHash)" -Level "WARN"
            Set-Location $AppDir
            git reset --hard $Global:PreviousCommitHash
            Write-Log "Code reverted successfully."
        } else {
            Write-Log "Could not find previous commit hash. Manual code restore may be needed from backup at '$($Global:AppBackupFile)'." -Level "ERROR"
        }

        # 3. Rebuild image with old code and start DB
        Write-Log "Rebuilding application with old code and starting database..." -Level "WARN"
        docker-compose build --no-cache | Out-Null
        docker-compose up -d db # Start only the DB for restore
        Start-Sleep -Seconds 10

        # 4. Restore database from backup
        if ($Global:DbBackupFile -and (Test-Path $Global:DbBackupFile)) {
            Write-Log "Restoring database from backup: $($Global:DbBackupFile)" -Level "WARN"
            Get-Content $Global:DbBackupFile | docker-compose exec -T db psql -U postgres -d fund_accounting_db
            Write-Log "Database restored successfully."
        } else {
            Write-Log "Could not find database backup file. Manual database restore is required." -Level "ERROR"
        }

        # 5. Start the full application
        Write-Log "Restarting application with restored state..." -Level "WARN"
        docker-compose up -d

        Write-Log "--- ROLLBACK COMPLETE ---" -Level "SUCCESS"
        Write-Log "The application has been restored to its previous state." -Level "SUCCESS"
    } catch {
        Write-Log "!!! CRITICAL: ROLLBACK FAILED !!!" -Level "ERROR"
        Write-Log "An error occurred during the rollback process: $($_.Exception.Message)" -Level "ERROR"
        Write-Log "Manual intervention is required. Please use the backups located in '$BackupPath'." -Level "ERROR"
    }
    
    # Exit with an error code to indicate failure
    exit 1
}

# --- Main Script Execution ---
try {
    Write-Log "==============================================" -Level "SUCCESS"
    Write-Log "  Starting Nonprofit Fund Accounting Update   " -Level "SUCCESS"
    Write-Log "==============================================" -Level "SUCCESS"

    Create-Backup
    Pull-Latest-Code
    Update-Docker-Containers
    Verify-Update

    Write-Log "================================================" -Level "SUCCESS"
    Write-Log "  Update Complete and Successfully Deployed!    " -Level "SUCCESS"
    Write-Log "================================================" -Level "SUCCESS"
} catch {
    Rollback-Changes -ErrorMessage $_.Exception.Message
}
