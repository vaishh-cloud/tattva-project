import os
import base64
import logging
import requests
from datetime import datetime
from io import BytesIO
from PIL import Image
from dotenv import load_dotenv

# Configure logger for the image_utils module
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Configuration
ALLOWED_IMAGE_EXTENSIONS = os.getenv('ALLOWED_IMAGE_EXTENSIONS', 'png,jpeg,jpg').split(',')
MAX_IMAGE_SIZE = int(os.getenv('MAX_IMAGE_SIZE', 5 * 1024 * 1024))  # 5MB
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "your_key_here")
# Updated URL - replace with the correct endpoint from TogetherAI's documentation
TOGETHER_API_URL = os.getenv("TOGETHER_API_URL", "https://api.together.xyz/v1/vision/completions")
LLAMA_VISION_MODEL = os.getenv("LLAMA_VISION_MODEL", "meta-llama/Llama-3.3-70B-Vision-Free")

# Custom exception for image processing errors
class ImageProcessingError(Exception):
    """Custom exception for image processing errors"""
    pass

# Function to check if a file has an allowed image extension
def allowed_image(filename):
    """Check if the file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

# Function to validate image size and format
def validate_image(file_stream):
    """Validate image size and format"""
    file_stream.seek(0, os.SEEK_END)
    size = file_stream.tell()
    file_stream.seek(0)
    if size > MAX_IMAGE_SIZE:
        raise ImageProcessingError(f"Image size exceeds {MAX_IMAGE_SIZE/1024/1024}MB limit")
    
    try:
        img = Image.open(file_stream)
        img.verify()  # Verify image integrity
        file_stream.seek(0)
        return size
    except Exception as e:
        logger.error(f"Invalid image file: {str(e)}")
        raise ImageProcessingError(f"Invalid image file: {str(e)}")

# Function to encode image to base64
def encode_image_to_base64(file_stream):
    """Convert image to base64 string"""
    try:
        validate_image(file_stream)
        img = Image.open(file_stream)
        buffered = BytesIO()
        img_format = img.format if img.format else 'PNG'
        img.save(buffered, format=img_format)
        img_str = base64.b64encode(buffered.getvalue()).decode('utf-8')
        file_stream.seek(0)
        return f"data:image/{img_format.lower()};base64,{img_str}"
    except Exception as e:
        logger.error(f"Error encoding image: {str(e)}")
        raise ImageProcessingError(f"Failed to encode image: {str(e)}")

# Function to summarize image using TogetherAI's Llama-vision-free model
def summarize_image(file_stream, query: str = "Summarize the content of this image"):
    """Summarize image content using Llama-vision-free model"""
    try:
        # Encode image to base64
        base64_image = encode_image_to_base64(file_stream)
        
        # Prepare API request
        headers = {
            "Authorization": f"Bearer {TOGETHER_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": LLAMA_VISION_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": query},
                        {"type": "image_url", "image_url": {"url": base64_image}}
                    ]
                }
            ],
            "temperature": 0.7,
            "max_tokens": 500
        }
        
        # Make API call
        response = requests.post(TOGETHER_API_URL, json=data, headers=headers, timeout=30)
        response.raise_for_status()
        
        # Extract response
        result = response.json()
        if "choices" not in result or not result["choices"]:
            raise ImageProcessingError("Invalid response from API")
        
        summary = result["choices"][0]["message"]["content"]
        logger.info(f"Image summarized successfully")
        return summary
    
    except requests.Timeout:
        logger.error("Image summarization API request timed out")
        return "Image summarization is currently unavailable due to a timeout. Please try again later."
    except requests.RequestException as e:
        logger.error(f"Image summarization API request failed: {str(e)}")
        return f"Failed to summarize the image due to an API error (Status Code: {e.response.status_code if e.response else 'Unknown'}). Please check the API endpoint or try again later."
    except KeyError as e:
        logger.error(f"Invalid API response format: {str(e)}")
        return "Received an invalid response from the image summarization service."
    except Exception as e:
        logger.error(f"Unexpected image summarization error: {str(e)}")
        return f"Unexpected error during image summarization: {str(e)}"