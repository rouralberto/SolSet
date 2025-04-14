#!/bin/bash

# SolSet Sun Tracker Deployment Script
# This script deploys the app to either AWS S3 or Alibaba Cloud OSS

set -e  # Exit on any error

# Build the app
echo "Building the application..."
npm run build

# Function to deploy to AWS S3
deploy_to_s3() {
  BUCKET_NAME=${1:-"solset-sun-tracker"}
  
  echo "Deploying to AWS S3 bucket: $BUCKET_NAME"
  
  # Check if AWS CLI is installed
  if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed. Please install it first."
    exit 1
  fi
  
  # Deploy to S3
  aws s3 sync dist/ s3://$BUCKET_NAME --acl public-read
  
  echo "Deployment to AWS S3 completed!"
  echo "Your app should be available at: http://$BUCKET_NAME.s3-website-$(aws configure get region).amazonaws.com"
}

# Function to deploy to Alibaba Cloud OSS
deploy_to_oss() {
  BUCKET_NAME=${1:-"solset-sun-tracker"}
  
  echo "Deploying to Alibaba Cloud OSS bucket: $BUCKET_NAME"
  
  # Check if ossutil is installed
  if ! command -v ossutil &> /dev/null; then
    echo "Error: ossutil is not installed. Please install it first."
    exit 1
  fi
  
  # Deploy to OSS
  ossutil cp -r dist/ oss://$BUCKET_NAME/ --acl public-read
  
  echo "Deployment to Alibaba Cloud OSS completed!"
}

# Main script
case "$1" in
  "s3")
    deploy_to_s3 $2
    ;;
  "oss")
    deploy_to_oss $2
    ;;
  *)
    echo "Usage: $0 [s3|oss] [bucket-name]"
    echo ""
    echo "  s3   - Deploy to AWS S3"
    echo "  oss  - Deploy to Alibaba Cloud OSS"
    echo ""
    echo "If bucket-name is not provided, 'solset-sun-tracker' will be used as default."
    ;;
esac

exit 0 
