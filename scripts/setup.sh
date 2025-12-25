#!/bin/bash

################################################################################
# Hotel Price Scraper - Local Development Setup Script
# 
# This script automates the initial setup for local development environment.
# It handles dependency installation, environment configuration, and database setup.
#
# Usage: bash scripts/setup.sh
################################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
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

################################################################################
# Check Prerequisites
################################################################################
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    local missing_tools=0
    
    # Check for Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 is not installed"
        missing_tools=1
    else
        log_success "Python 3 found: $(python3 --version)"
    fi
    
    # Check for pip
    if ! command -v pip3 &> /dev/null; then
        log_error "pip3 is not installed"
        missing_tools=1
    else
        log_success "pip3 found: $(pip3 --version)"
    fi
    
    # Check for git
    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        missing_tools=1
    else
        log_success "Git found: $(git --version)"
    fi
    
    if [ $missing_tools -eq 1 ]; then
        log_error "Please install missing prerequisites and try again"
        exit 1
    fi
}

################################################################################
# Create Virtual Environment
################################################################################
setup_virtual_environment() {
    log_info "Setting up Python virtual environment..."
    
    if [ -d "venv" ]; then
        log_warning "Virtual environment already exists"
        read -p "Do you want to recreate it? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            rm -rf venv
            python3 -m venv venv
            log_success "Virtual environment recreated"
        fi
    else
        python3 -m venv venv
        log_success "Virtual environment created"
    fi
    
    # Activate virtual environment
    source venv/bin/activate
    log_success "Virtual environment activated"
    
    # Upgrade pip, setuptools, and wheel
    log_info "Upgrading pip, setuptools, and wheel..."
    pip3 install --upgrade pip setuptools wheel
    log_success "Package managers upgraded"
}

################################################################################
# Install Dependencies
################################################################################
install_dependencies() {
    log_info "Installing project dependencies..."
    
    # Check if requirements.txt exists
    if [ ! -f "requirements.txt" ]; then
        log_warning "requirements.txt not found, skipping dependency installation"
        return
    fi
    
    pip3 install -r requirements.txt
    log_success "Dependencies installed successfully"
    
    # Install development dependencies if they exist
    if [ -f "requirements-dev.txt" ]; then
        log_info "Installing development dependencies..."
        pip3 install -r requirements-dev.txt
        log_success "Development dependencies installed"
    fi
}

################################################################################
# Setup Environment Variables
################################################################################
setup_environment_variables() {
    log_info "Setting up environment variables..."
    
    if [ -f ".env" ]; then
        log_warning ".env file already exists"
    else
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success "Created .env from .env.example"
            log_warning "Please update .env file with your configuration"
        else
            log_warning ".env.example not found, skipping .env creation"
        fi
    fi
}

################################################################################
# Database Setup
################################################################################
setup_database() {
    log_info "Setting up database..."
    
    # Check if database initialization script exists
    if [ -f "scripts/init_db.sh" ]; then
        log_info "Running database initialization script..."
        bash scripts/init_db.sh
        log_success "Database initialized"
    elif [ -f "manage.py" ]; then
        # Django project
        log_info "Running Django migrations..."
        python manage.py migrate
        log_success "Django migrations completed"
    else
        log_warning "No database initialization script found"
    fi
}

################################################################################
# Install Pre-commit Hooks
################################################################################
setup_precommit_hooks() {
    log_info "Setting up pre-commit hooks..."
    
    if command -v pre-commit &> /dev/null; then
        if [ -f ".pre-commit-config.yaml" ]; then
            pre-commit install
            log_success "Pre-commit hooks installed"
        else
            log_warning ".pre-commit-config.yaml not found, skipping pre-commit setup"
        fi
    else
        log_warning "pre-commit not installed, skipping pre-commit setup"
    fi
}

################################################################################
# Run Tests
################################################################################
run_tests() {
    log_info "Running tests to verify setup..."
    
    if [ -f "pytest.ini" ] || [ -f "setup.py" ] && grep -q "pytest" requirements*.txt 2>/dev/null; then
        python -m pytest --version > /dev/null 2>&1 || {
            log_warning "pytest not found or not configured"
            return
        }
        python -m pytest tests/ -v --tb=short 2>/dev/null || log_warning "Some tests failed or no tests found"
    elif [ -f "manage.py" ]; then
        log_info "Running Django tests..."
        python manage.py test --no-input 2>/dev/null || log_warning "Django tests not configured or failed"
    else
        log_warning "No test framework detected, skipping tests"
    fi
}

################################################################################
# Print Setup Summary
################################################################################
print_summary() {
    log_success "Setup completed successfully!"
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}Setup Summary${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Activate virtual environment: source venv/bin/activate"
    echo "2. Update .env with your configuration if needed"
    echo "3. Start development: python manage.py runserver (or your app's start command)"
    echo ""
    echo "Useful commands:"
    echo "  • Install additional packages: pip install <package>"
    echo "  • Run tests: pytest tests/ or python manage.py test"
    echo "  • Format code: black . or python -m black ."
    echo "  • Lint code: flake8 . or pylint ."
    echo ""
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

################################################################################
# Main Setup Flow
################################################################################
main() {
    echo ""
    echo -e "${BLUE}╔═══════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║ Hotel Price Scraper - Local Development Setup             ║${NC}"
    echo -e "${BLUE}╚═══════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    # Check we're in the right directory
    if [ ! -f "setup.py" ] && [ ! -f "manage.py" ] && [ ! -f "requirements.txt" ]; then
        log_error "This script must be run from the project root directory"
        exit 1
    fi
    
    check_prerequisites
    setup_virtual_environment
    install_dependencies
    setup_environment_variables
    setup_database
    setup_precommit_hooks
    
    # Optional: Run tests
    read -p "Do you want to run tests? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        run_tests
    fi
    
    print_summary
}

# Run main function
main "$@"
