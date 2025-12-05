#!/bin/bash

# e2e-install-extension.sh
# End-to-end script to install the traceback Firebase extension to a Firebase project
# This script creates temporary Firebase project files, checks existing configuration,
# and installs/updates the extension as needed.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Extension metadata
EXTENSION_NAME="traceback"
EXTENSION_VERSION="0.5.0"

# Function to print colored messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Install or update the traceback Firebase extension to a Firebase project.

Required arguments:
  --service-account PATH    Path to service account JSON file

Extension configuration:
  --project-id ID           Firebase project ID (auto-detected from service account if not provided)
  --location LOCATION       Cloud Functions location (default: us-central1)
  --ios-bundle-id ID        iOS bundle ID (e.g., com.mycompany.myapp)
  --ios-team-id ID          iOS team ID (e.g., ZZZZZZZZZZ)
  --android-bundle-id ID    Android package name (e.g., com.mycompany.myapp)
  --android-sha SHA         Android SHA256 fingerprint (optional)
  --android-scheme SCHEME   Android scheme attribute (optional)
  --min-instances NUM       Minimum Cloud Function instances (default: 0)
  --domain NAME             Custom domain name (optional, defaults to \${PROJECT_ID}-traceback)
  --extension-version VER   Extension version to install (default: 0.5.0)
  --local-path PATH         Install from local development code instead of registry

Options:
  --force                   Force reinstall/update even if configuration matches
  --deploy-hosting          Also deploy hosting configuration
  -h, --help                Show this help message

Example:
  $0 \\
    --service-account ./service-account.json \\
    --ios-bundle-id com.mycompany.myapp \\
    --ios-team-id ABCDEFGHIJ \\
    --android-bundle-id com.mycompany.myapp \\
    --location us-central1 \\
    --min-instances 1

EOF
}

# Parse command line arguments
SERVICE_ACCOUNT=""
PROJECT_ID=""
DOMAIN=""
LOCATION="us-central1"
IOS_BUNDLE_ID=""
IOS_TEAM_ID=""
ANDROID_BUNDLE_ID=""
ANDROID_SHA=""
ANDROID_SCHEME=""
MIN_INSTANCES="0"
FORCE_INSTALL=false
DEPLOY_HOSTING=false
LOCAL_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --service-account)
            SERVICE_ACCOUNT="$2"
            shift 2
            ;;
        --project-id)
            PROJECT_ID="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --location)
            LOCATION="$2"
            shift 2
            ;;
        --ios-bundle-id)
            IOS_BUNDLE_ID="$2"
            shift 2
            ;;
        --ios-team-id)
            IOS_TEAM_ID="$2"
            shift 2
            ;;
        --android-bundle-id)
            ANDROID_BUNDLE_ID="$2"
            shift 2
            ;;
        --android-sha)
            ANDROID_SHA="$2"
            shift 2
            ;;
        --android-scheme)
            ANDROID_SCHEME="$2"
            shift 2
            ;;
        --min-instances)
            MIN_INSTANCES="$2"
            shift 2
            ;;
        --extension-version)
            EXTENSION_VERSION="$2"
            shift 2
            ;;
        --local-path)
            LOCAL_PATH="$2"
            shift 2
            ;;
        --force)
            FORCE_INSTALL=true
            shift
            ;;
        --deploy-hosting)
            DEPLOY_HOSTING=true
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required arguments
if [ -z "$SERVICE_ACCOUNT" ]; then
    log_error "Service account file path is required"
    show_usage
    exit 1
fi

if [ -z "$IOS_BUNDLE_ID" ]; then
    log_error "iOS bundle ID is required"
    show_usage
    exit 1
fi

if [ -z "$IOS_TEAM_ID" ]; then
    log_error "iOS team ID is required"
    show_usage
    exit 1
fi

if [ -z "$ANDROID_BUNDLE_ID" ]; then
    log_error "Android bundle ID is required"
    show_usage
    exit 1
fi

# Check if service account file exists
if [ ! -f "$SERVICE_ACCOUNT" ]; then
    log_error "Service account file not found: $SERVICE_ACCOUNT"
    exit 1
fi

# Extract project ID from service account file if not provided
if [ -z "$PROJECT_ID" ]; then
    log_info "Extracting project ID from service account file..."

    # Check if jq is available for better JSON parsing
    if command -v jq &> /dev/null; then
        PROJECT_ID=$(jq -r '.project_id' "$SERVICE_ACCOUNT")
    else
        # Fallback to grep/sed if jq is not available
        PROJECT_ID=$(grep -o '"project_id"[[:space:]]*:[[:space:]]*"[^"]*"' "$SERVICE_ACCOUNT" | sed 's/.*"project_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/')
    fi

    if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "null" ]; then
        log_error "Could not extract project_id from service account file"
        log_error "Please provide --project-id explicitly"
        exit 1
    fi

    log_success "Detected project ID: $PROJECT_ID"
fi

# Set default domain if not provided
if [ -z "$DOMAIN" ]; then
    DOMAIN="${PROJECT_ID}-traceback"
    log_info "Using default domain: $DOMAIN"
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    log_error "Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Display configuration
echo ""
echo "=========================================="
echo "Installing Traceback Extension"
echo "=========================================="
echo "Project:             $PROJECT_ID"
if [ -n "$LOCAL_PATH" ]; then
    echo "Extension:           LOCAL ($LOCAL_PATH)"
else
    echo "Extension:           $EXTENSION_NAME@$EXTENSION_VERSION"
fi
echo "Domain:              $DOMAIN"
echo "Service account:     $SERVICE_ACCOUNT"
echo ""

# Set the Google Application Credentials environment variable
export GOOGLE_APPLICATION_CREDENTIALS="$(cd "$(dirname "$SERVICE_ACCOUNT")" && pwd)/$(basename "$SERVICE_ACCOUNT")"
log_info "Using service account: $GOOGLE_APPLICATION_CREDENTIALS"

# Verify Firebase CLI can access the project
log_info "Verifying Firebase CLI authentication..."
if ! firebase projects:list --project="$PROJECT_ID" --non-interactive >/dev/null 2>&1; then
    log_warning "Could not verify Firebase CLI access (this is normal for service accounts)"
    log_info "Proceeding with deployment..."
fi

# Create temporary working directory
TEMP_DIR=$(mktemp -d)
log_info "Created temporary directory: $TEMP_DIR"

# Cleanup function
cleanup() {
    log_info "Cleaning up temporary directory..."
    rm -rf "$TEMP_DIR"
}

# Register cleanup on exit
trap cleanup EXIT

cd "$TEMP_DIR"

# ==============================================================================
# STEP 1: INITIALIZE FIREBASE PROJECT STRUCTURE
# ==============================================================================

echo ""
log_info "Step 1: Initializing Firebase project structure..."

# Create .firebaserc
cat > .firebaserc << EOF
{
  "projects": {
    "default": "$PROJECT_ID"
  }
}
EOF

# Create initial firebase.json
cat > firebase.json << EOF
{
  "extensions": {}
}
EOF

# Create firestore.indexes.json
cat > firestore.indexes.json << EOF
{
  "indexes": [],
  "fieldOverrides": []
}
EOF

# Create firestore.rules (basic security rules)
cat > firestore.rules << EOF
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
EOF

# Create extensions directory
mkdir -p extensions

# Create placeholder public directory for hosting
if [ "$DEPLOY_HOSTING" = true ]; then
    mkdir -p public
    cat > public/index.html << EOF
<!DOCTYPE html>
<html>
<head>
  <title>TraceBack</title>
</head>
<body>
  <h1>TraceBack Extension</h1>
  <p>This is handled by the extension.</p>
</body>
</html>
EOF
fi

log_success "Created Firebase project structure"

# ==============================================================================
# STEP 2: EXPORT CURRENT CONFIGURATION
# ==============================================================================

echo ""
log_info "Step 2: Exporting current extensions configuration..."

# Try to export existing configuration with timeout
# Temporarily disable exit-on-error for this command
set +e

# Check if timeout command is available (Linux) or gtimeout (macOS with coreutils)
if command -v timeout &> /dev/null; then
    TIMEOUT_CMD="timeout 30s"
elif command -v gtimeout &> /dev/null; then
    TIMEOUT_CMD="gtimeout 30s"
else
    log_warning "timeout command not available, running without timeout"
    TIMEOUT_CMD=""
fi

log_info "Running: firebase ext:export --project=$PROJECT_ID --non-interactive"
EXPORT_OUTPUT=$($TIMEOUT_CMD firebase ext:export --project="$PROJECT_ID" --non-interactive 2>&1)
EXPORT_EXIT_CODE=$?
set -e

log_info "Export command exit code: $EXPORT_EXIT_CODE"

# Check for timeout (exit code 124 for timeout command)
if [ $EXPORT_EXIT_CODE -eq 124 ]; then
    log_warning "Export command timed out after 30 seconds"
    log_info "Continuing with fresh configuration..."
    EXPORT_EXIT_CODE=1
fi

if [ $EXPORT_EXIT_CODE -ne 0 ]; then
    log_info "Export output: $EXPORT_OUTPUT"
    if echo "$EXPORT_OUTPUT" | grep -q "Permission denied\|403"; then
        echo ""
        log_error "Permission denied when accessing Firebase Extensions"
        echo ""
        echo "PREREQUISITES:"
        echo ""
        echo "1. Blaze (Pay as you go) plan is REQUIRED"
        echo "   Upgrade at: https://console.firebase.google.com/project/$PROJECT_ID/usage/details"
        echo ""
        echo "2. Required services must be set up:"
        echo "   • Cloud Firestore - Create the (default) database"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/firestore"
        echo "   • Cloud Functions - Must be enabled"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/functions"
        echo "   • Firebase Hosting"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/hosting"
        echo ""
        echo "3. Required APIs must be enabled:"
        echo "   • Firebase Extensions API"
        echo "     https://console.cloud.google.com/apis/library/firebaseextensions.googleapis.com?project=$PROJECT_ID"
        echo "   • Cloud Functions API"
        echo "     https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=$PROJECT_ID"
        echo "   • Firestore API"
        echo "     https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=$PROJECT_ID"
        echo ""
        echo "4. Service Account: $(jq -r '.client_email // "unknown"' "$SERVICE_ACCOUNT" 2>/dev/null)"
        echo "   Required IAM roles:"
        echo "   • Firebase Extensions Admin (roles/firebaseextensions.admin)"
        echo "   • Service Usage Consumer (roles/serviceusage.serviceUsageConsumer)"
        echo "   • Cloud Functions Admin (roles/cloudfunctions.admin)"
        echo "   • Cloud Datastore Owner (roles/datastore.owner)"
        echo "   • Firebase Hosting Admin (roles/firebasehosting.admin)"
        echo ""
        echo "   Grant roles at: https://console.cloud.google.com/iam-admin/iam?project=$PROJECT_ID"
        echo "   OR grant 'Editor' role for broader permissions"
        echo ""
        exit 1
    else
        log_warning "No existing extensions found or unable to export"
        log_info "Continuing with fresh configuration..."
    fi
else
    log_success "Successfully exported existing extensions configuration"
fi

# ==============================================================================
# STEP 3: CHECK EXISTING CONFIGURATION
# ==============================================================================

echo ""
log_info "Step 3: Checking for existing installation..."

EXTENSION_EXISTS=false
CONFIG_MATCHES=false

# Check if extension is already installed
if [ -f "firebase.json" ]; then
    if command -v jq &> /dev/null; then
        ALREADY_INSTALLED=$(jq -r '.extensions.traceback // empty' firebase.json 2>/dev/null)
    else
        ALREADY_INSTALLED=$(grep -o '"traceback"' firebase.json 2>/dev/null)
    fi

    if [ -n "$ALREADY_INSTALLED" ]; then
        EXTENSION_EXISTS=true
        log_success "Found existing traceback extension installation"

        # Check if the .env file exists
        if [ -f "extensions/traceback.env" ]; then
            log_info "Comparing configuration..."

            # Build expected configuration
            EXPECTED_CONFIG="LOCATION=$LOCATION
IOS_BUNDLE_ID=$IOS_BUNDLE_ID
IOS_TEAM_ID=$IOS_TEAM_ID
ANDROID_BUNDLE_ID=$ANDROID_BUNDLE_ID
MIN_INSTANCES=$MIN_INSTANCES"

            if [ -n "$ANDROID_SHA" ]; then
                EXPECTED_CONFIG="${EXPECTED_CONFIG}
ANDROID_SHA=$ANDROID_SHA"
            fi

            if [ -n "$ANDROID_SCHEME" ]; then
                EXPECTED_CONFIG="${EXPECTED_CONFIG}
ANDROID_SCHEME=$ANDROID_SCHEME"
            fi

            if [ -n "$DOMAIN" ]; then
                EXPECTED_CONFIG="${EXPECTED_CONFIG}
DOMAIN=$DOMAIN"
            fi

            # Read existing configuration (skip comments and empty lines)
            EXISTING_CONFIG=$(grep -v '^#' extensions/traceback.env | grep -v '^[[:space:]]*$' | sort)
            EXPECTED_CONFIG_SORTED=$(echo "$EXPECTED_CONFIG" | sort)

            # Compare configurations
            if [ "$EXISTING_CONFIG" = "$EXPECTED_CONFIG_SORTED" ]; then
                CONFIG_MATCHES=true
                log_success "Configuration matches existing installation"
            else
                log_warning "Configuration differs from existing installation"
            fi
        else
            log_warning "No existing configuration file found"
        fi
    else
        log_info "Extension is not currently installed"
    fi
fi

# Determine if we should proceed
if [ "$EXTENSION_EXISTS" = true ] && [ "$CONFIG_MATCHES" = true ] && [ "$FORCE_INSTALL" = false ]; then
    echo ""
    echo "=========================================="
    echo "✓ Extension already installed with identical configuration"
    echo "=========================================="
    echo ""
    echo "Extension: $EXTENSION_NAME@$EXTENSION_VERSION"
    echo "Configuration:"
    echo "  Location:          $LOCATION"
    echo "  iOS Bundle ID:     $IOS_BUNDLE_ID"
    echo "  iOS Team ID:       $IOS_TEAM_ID"
    echo "  Android Bundle ID: $ANDROID_BUNDLE_ID"
    if [ -n "$ANDROID_SHA" ]; then
        echo "  Android SHA256:    $ANDROID_SHA"
    fi
    if [ -n "$ANDROID_SCHEME" ]; then
        echo "  Android Scheme:    $ANDROID_SCHEME"
    fi
    if [ -n "$DOMAIN" ]; then
        echo "  Custom Domain:     $DOMAIN"
    fi
    echo ""
    log_info "No changes needed. Use --force to reinstall anyway."
    exit 0
fi

# ==============================================================================
# STEP 4: CREATE EXTENSION CONFIGURATION
# ==============================================================================

echo ""
log_info "Step 4: Creating extension configuration..."

# Determine extension source (local path or registry)
if [ -n "$LOCAL_PATH" ]; then
    # Resolve absolute path
    EXTENSION_SOURCE=$(cd "$(dirname "$LOCAL_PATH")" && pwd)/$(basename "$LOCAL_PATH")
    log_info "Using local extension path: $EXTENSION_SOURCE"

    # Verify the path exists
    if [ ! -d "$EXTENSION_SOURCE" ]; then
        log_error "Local extension path does not exist: $EXTENSION_SOURCE"
        exit 1
    fi

    # Verify it's a valid extension (has extension.yaml)
    if [ ! -f "$EXTENSION_SOURCE/extension.yaml" ]; then
        log_error "Invalid extension: extension.yaml not found in $EXTENSION_SOURCE"
        exit 1
    fi
else
    EXTENSION_SOURCE="inqbarna/traceback@$EXTENSION_VERSION"
    log_info "Using registry extension: $EXTENSION_SOURCE"
fi

# Update firebase.json
if command -v jq &> /dev/null; then
    jq --arg source "$EXTENSION_SOURCE" \
       '.extensions.traceback = $source' \
       firebase.json > firebase.json.tmp && mv firebase.json.tmp firebase.json
else
    # Fallback: simple text replacement
    if grep -q '"extensions"' firebase.json; then
        sed -i.bak 's/"extensions"[[:space:]]*:[[:space:]]*{/"extensions":{"traceback":"'"$EXTENSION_SOURCE"'",/' firebase.json
        rm -f firebase.json.bak
    else
        echo '{"extensions":{"traceback":"'"$EXTENSION_SOURCE"'"}}' > firebase.json
    fi
fi

# Create traceback.env file
cat > extensions/traceback.env << EOF
# Extension configuration for Traceback
# Auto-generated by e2e-install-extension.sh

LOCATION=$LOCATION
IOS_BUNDLE_ID=$IOS_BUNDLE_ID
IOS_TEAM_ID=$IOS_TEAM_ID
ANDROID_BUNDLE_ID=$ANDROID_BUNDLE_ID
MIN_INSTANCES=$MIN_INSTANCES
EOF

# Add optional parameters if provided
if [ -n "$ANDROID_SHA" ]; then
    echo "ANDROID_SHA=$ANDROID_SHA" >> extensions/traceback.env
fi

if [ -n "$ANDROID_SCHEME" ]; then
    echo "ANDROID_SCHEME=$ANDROID_SCHEME" >> extensions/traceback.env
fi

if [ -n "$DOMAIN" ]; then
    echo "DOMAIN=$DOMAIN" >> extensions/traceback.env
fi

log_success "Created configuration files"

# ==============================================================================
# STEP 5: DEPLOY EXTENSION
# ==============================================================================

echo ""
log_info "Step 5: Deploying extension to Firebase..."
echo ""

# Capture both stdout and stderr
DEPLOY_OUTPUT=$(firebase deploy --only extensions --project="$PROJECT_ID" --non-interactive 2>&1)
DEPLOY_EXIT_CODE=$?

# Display the output
echo "$DEPLOY_OUTPUT"

# Check deployment result
if [ $DEPLOY_EXIT_CODE -eq 0 ]; then
    echo ""
    log_success "Extension deployed successfully!"

    # Deploy hosting if requested
    if [ "$DEPLOY_HOSTING" = true ]; then
        echo ""
        log_info "Step 6: Deploying hosting configuration..."

        # Update firebase.json with hosting configuration
        if command -v jq &> /dev/null; then
            jq --arg domain "$DOMAIN" --arg location "$LOCATION" \
               '.hosting = [{
                   "site": $domain,
                   "public": "public",
                   "appAssociation": "NONE",
                   "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
                   "rewrites": [{
                       "source": "**",
                       "function": "ext-traceback-dynamichostingcontent",
                       "region": $location
                   }]
               }]' firebase.json > firebase.json.tmp && mv firebase.json.tmp firebase.json
        fi

        firebase deploy --only hosting --project="$PROJECT_ID" --non-interactive

        if [ $? -eq 0 ]; then
            log_success "Hosting deployed successfully!"
        else
            log_warning "Hosting deployment failed, but extension is installed"
        fi
    fi

    # Print summary
    echo ""
    echo "=========================================="
    echo "Installation Complete!"
    echo "=========================================="
    echo ""
    echo "Summary:"
    echo "  Project ID:        $PROJECT_ID"
    if [ -n "$LOCAL_PATH" ]; then
        echo "  Extension:         LOCAL ($EXTENSION_SOURCE)"
    else
        echo "  Extension:         $EXTENSION_NAME@$EXTENSION_VERSION"
    fi
    echo "  Domain:            $DOMAIN"
    if [ "$DEPLOY_HOSTING" = true ]; then
        echo "  Hosting URL:       https://$DOMAIN.web.app"
    fi
    echo "  iOS Bundle ID:     $IOS_BUNDLE_ID"
    echo "  iOS Team ID:       $IOS_TEAM_ID"
    echo "  Android Bundle ID: $ANDROID_BUNDLE_ID"
    echo "  Location:          $LOCATION"
    echo ""
    log_info "Configure your app to use: https://$DOMAIN.web.app"
    echo ""

else
    echo ""
    log_error "Extension deployment failed"
    echo ""

    # Parse and display specific error information
    if echo "$DEPLOY_OUTPUT" | grep -q "Permission denied\|403"; then
        echo "ERROR: Permission denied"
        echo ""
        echo "PREREQUISITES:"
        echo ""
        echo "1. Blaze (Pay as you go) plan is REQUIRED"
        echo "   Upgrade at: https://console.firebase.google.com/project/$PROJECT_ID/usage/details"
        echo ""
        echo "2. Required services must be set up:"
        echo "   • Cloud Firestore - Create the (default) database"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/firestore"
        echo "   • Cloud Functions - Must be enabled"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/functions"
        echo "   • Firebase Hosting"
        echo "     https://console.firebase.google.com/project/$PROJECT_ID/hosting"
        echo ""
        echo "3. Required APIs must be enabled:"
        echo "   • Firebase Extensions API"
        echo "     https://console.cloud.google.com/apis/library/firebaseextensions.googleapis.com?project=$PROJECT_ID"
        echo "   • Cloud Functions API"
        echo "     https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=$PROJECT_ID"
        echo "   • Firestore API"
        echo "     https://console.cloud.google.com/apis/library/firestore.googleapis.com?project=$PROJECT_ID"
        echo ""
        echo "4. Service Account: $(jq -r '.client_email // "unknown"' "$SERVICE_ACCOUNT" 2>/dev/null)"
        echo "   Required IAM roles:"
        echo "   • Firebase Extensions Admin (roles/firebaseextensions.admin)"
        echo "   • Service Usage Consumer (roles/serviceusage.serviceUsageConsumer)"
        echo "   • Cloud Functions Admin (roles/cloudfunctions.admin)"
        echo "   • Cloud Datastore Owner (roles/datastore.owner)"
        echo "   • Firebase Hosting Admin (roles/firebasehosting.admin)"
        echo ""
        echo "   Grant roles at: https://console.cloud.google.com/iam-admin/iam?project=$PROJECT_ID"
        echo "   OR grant 'Editor' role for broader permissions"

    elif echo "$DEPLOY_OUTPUT" | grep -q "404"; then
        log_error "Resource not found"
        echo ""
        echo "The project or extension might not exist."
        echo "Please verify:"
        echo "  - Project ID: $PROJECT_ID"
        echo "  - Extension: inqbarna/traceback@$EXTENSION_VERSION"

    elif echo "$DEPLOY_OUTPUT" | grep -q "authentication"; then
        log_error "Authentication failed"
        echo ""
        echo "The service account credentials might be invalid."
        echo "Please verify:"
        echo "  - Service account file: $SERVICE_ACCOUNT"
        echo "  - The service account belongs to project: $PROJECT_ID"
    else
        log_error "An unexpected error occurred"
        echo "Check the error messages above for details."
    fi

    echo ""
    echo "Configuration files are available in: $TEMP_DIR"
    echo "Inspect them with:"
    echo "  cat $TEMP_DIR/firebase.json"
    echo "  cat $TEMP_DIR/extensions/traceback.env"
    echo ""
    echo "Temporary directory will be cleaned up automatically."
    echo ""
    exit 1
fi
