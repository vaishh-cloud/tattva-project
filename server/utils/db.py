from pymongo import MongoClient  # Import MongoClient for MongoDB connection
from dotenv import load_dotenv  # Import load_dotenv to load environment variables
import os  # Import os for environment variable access

# Load environment variables from .env file
load_dotenv()

# Initialize MongoDB client with connection string from environment variable
client = MongoClient(os.getenv("MONGO_URI"))

# Connect to the "InsightPaper" database
db = client.get_database("InsightPaper")

# Define collection references for the database
users_collection = db["users"]  # Collection for user data
documents_collection = db["documents"]  # Collection for document data
chat_sessions_collection = db["chat_sessions"]  # Collection for chat session data
queries_collection = db["queries"]  # Collection for query data