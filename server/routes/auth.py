from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, jwt_required, get_jwt_identity
from flask_bcrypt import Bcrypt
from utils.db import users_collection
from datetime import datetime
from bson import ObjectId
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__)
bcrypt = Bcrypt()

@auth_bp.route('/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')

        if not username or not email or not password:
            return jsonify({"error": "Username, email, and password are required"}), 400

        if users_collection.find_one({"email": email}):
            return jsonify({"message": "User already exists"}), 400

        hashed_password = bcrypt.generate_password_hash(password).decode('utf-8')
        
        user_data = {
            "username": username,
            "email": email,
            "password": hashed_password,
            "created_at": datetime.utcnow(),
            "last_login": None,
            "preferences": {"theme": "light"}
        }
        
        result = users_collection.insert_one(user_data)
        user_id = str(result.inserted_id)
        
        return jsonify({"message": "User registered successfully", "user_id": user_id}), 201

    except Exception as e:
        logger.error(f"Error during signup: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to register user"}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        if not username or not password:
            return jsonify({"error": "Username and password are required"}), 400

        user = users_collection.find_one({"username": username})
        
        if not user or not bcrypt.check_password_hash(user['password'], password):
            return jsonify({"message": "Invalid credentials"}), 401

        users_collection.update_one(
            {"username": username},
            {"$set": {"last_login": datetime.utcnow()}}
        )

        user_id = str(user['_id'])
        token = create_access_token(identity=user_id)
        
        return jsonify({
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user_id,
                "username": user['username'],
                "email": user['email']
            }
        }), 200

    except Exception as e:
        logger.error(f"Error during login: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to login"}), 500

@auth_bp.route('/preferences', methods=['GET'])
@jwt_required()
def get_preferences():
    try:
        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token during get_preferences")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"Fetching preferences for user_id: {user_id}")
        # Validate user_id as a valid ObjectId
        if not ObjectId.is_valid(user_id):
            logger.warning(f"Invalid ObjectId format for user_id: {user_id}")
            return jsonify({"error": "Invalid user ID format"}), 400

        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            logger.info(f"No user found for user_id: {user_id} in users_collection")
            return jsonify({"error": "User not found"}), 404

        preferences = user.get("preferences", {"theme": "light"})
        logger.info(f"Returning preferences: {preferences}")
        return jsonify({"preferences": preferences}), 200

    except Exception as e:
        logger.error(f"Error fetching preferences: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to fetch preferences: {str(e)}"}), 500

@auth_bp.route('/preferences', methods=['PUT'])
@jwt_required()
def update_preferences():
    try:
        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token during update_preferences")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"Updating preferences for user_id: {user_id}")
        # Validate user_id as a valid ObjectId
        if not ObjectId.is_valid(user_id):
            logger.warning(f"Invalid ObjectId format for user_id: {user_id}")
            return jsonify({"error": "Invalid user ID format"}), 400

        data = request.get_json()
        preferences = data.get('preferences')
        if not preferences:
            return jsonify({"error": "Preferences data is required"}), 400

        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            logger.info(f"No user found for user_id: {user_id} in users_collection")
            return jsonify({"error": "User not found"}), 404

        result = users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"preferences": preferences}}
        )
        if result.modified_count == 0:
            logger.info(f"No changes made to preferences for user_id: {user_id}")
            return jsonify({"error": "No changes made to preferences"}), 400

        logger.info(f"Preferences updated successfully for user_id: {user_id}")
        return jsonify({"message": "Preferences updated successfully"}), 200

    except Exception as e:
        logger.error(f"Error updating preferences: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to update preferences: {str(e)}"}), 500