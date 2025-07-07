from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from utils.db import chat_sessions_collection, queries_collection, documents_collection, users_collection
from bson import ObjectId
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

chat_bp = Blueprint('chat', __name__)

@chat_bp.route('/history', methods=['GET'])
@jwt_required()
def get_chat_history():
    try:
        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"Fetching chat history for user_id: {user_id}")
        chats = chat_sessions_collection.find({"user_id": user_id})
        chat_list = []
        for chat in chats:
            chat_id = str(chat["_id"])
            history = chat.get("history", [])
            logger.info(f"Chat {chat_id} has {len(history)} history entries")
            chat_data = {
                "id": chat_id,
                "name": chat.get("name", "New Chat"),
                "created_at": chat.get("created_at").isoformat(),
                "last_updated": chat.get("last_updated").isoformat(),
                "pinned": chat.get("pinned", False),
                "history": history,
                "document_id": str(chat["document_id"]) if chat.get("document_id") else None,
                "version": chat.get("version", 1)
            }
            chat_list.append(chat_data)

        logger.info(f"Returning {len(chat_list)} chats for user_id: {user_id}")
        return jsonify({"chats": chat_list}), 200

    except Exception as e:
        logger.error(f"Error fetching chat history: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to fetch chat history"}), 500

@chat_bp.route('/create', methods=['POST'])
@jwt_required()
def create_chat():
    try:
        user_id = get_jwt_identity()
        data = request.get_json()
        chat_name = data.get('name', 'New Chat')

        new_chat = {
            "user_id": user_id,
            "name": chat_name,
            "created_at": datetime.utcnow(),
            "last_updated": datetime.utcnow(),
            "pinned": False,
            "history": [],
            "document_id": None,
            "version": 1
        }

        result = chat_sessions_collection.insert_one(new_chat)
        chat_id = str(result.inserted_id)

        logger.info(f"Created new chat with chat_id: {chat_id} for user_id: {user_id}")
        return jsonify({"chat_id": chat_id, "message": "Chat created successfully"}), 201

    except Exception as e:
        logger.error(f"Error creating chat: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to create chat"}), 500

@chat_bp.route('/<chat_id>', methods=['GET'])
@jwt_required()
def get_chat(chat_id):
    try:
        if not ObjectId.is_valid(chat_id):
            return jsonify({"error": "Invalid chat ID"}), 400

        user_id = get_jwt_identity()
        chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id), "user_id": user_id})

        if not chat:
            return jsonify({"error": "Chat not found or not authorized"}), 404

        chat_data = {
            "id": str(chat["_id"]),
            "name": chat.get("name", "New Chat"),
            "created_at": chat.get("created_at").isoformat(),
            "last_updated": chat.get("last_updated").isoformat(),
            "pinned": chat.get("pinned", False),
            "history": chat.get("history", []),
            "document_id": str(chat["document_id"]) if chat.get("document_id") else None,
            "version": chat.get("version", 1)
        }

        logger.info(f"Retrieved chat {chat_id} with {len(chat_data['history'])} history entries")
        return jsonify(chat_data), 200

    except Exception as e:
        logger.error(f"Error fetching chat: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to fetch chat"}), 500

@chat_bp.route('/<chat_id>/rename', methods=['PUT'])
@jwt_required()
def rename_chat(chat_id):
    try:
        if not ObjectId.is_valid(chat_id):
            return jsonify({"error": "Invalid chat ID"}), 400

        user_id = get_jwt_identity()
        data = request.get_json()
        new_name = data.get('name')

        if not new_name or not isinstance(new_name, str) or new_name.strip() == "":
            return jsonify({"error": "Invalid chat name"}), 400

        chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id), "user_id": user_id})
        if not chat:
            return jsonify({"error": "Chat not found or not authorized"}), 404

        update_result = chat_sessions_collection.update_one(
            {"_id": ObjectId(chat_id), "version": chat["version"]},
            {
                "$set": {
                    "name": new_name.strip(),
                    "last_updated": datetime.utcnow()
                },
                "$inc": {"version": 1}
            }
        )

        if update_result.modified_count == 0:
            return jsonify({"error": "Failed to rename chat due to concurrent modification"}), 409

        logger.info(f"Renamed chat {chat_id} to {new_name}")
        return jsonify({"message": "Chat renamed successfully"}), 200

    except Exception as e:
        logger.error(f"Error renaming chat: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to rename chat"}), 500

@chat_bp.route('/<chat_id>/pin', methods=['PUT'])
@jwt_required()
def pin_chat(chat_id):
    try:
        if not ObjectId.is_valid(chat_id):
            return jsonify({"error": "Invalid chat ID"}), 400

        user_id = get_jwt_identity()
        data = request.get_json()
        pinned = data.get('pinned')

        if not isinstance(pinned, bool):
            return jsonify({"error": "Pinned status must be a boolean"}), 400

        chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id), "user_id": user_id})
        if not chat:
            return jsonify({"error": "Chat not found or not authorized"}), 404

        update_result = chat_sessions_collection.update_one(
            {"_id": ObjectId(chat_id), "version": chat["version"]},
            {
                "$set": {
                    "pinned": pinned,
                    "last_updated": datetime.utcnow()
                },
                "$inc": {"version": 1}
            }
        )

        if update_result.modified_count == 0:
            return jsonify({"error": "Failed to update pin status due to concurrent modification"}), 409

        logger.info(f"Updated pin status for chat {chat_id} to {pinned}")
        return jsonify({"message": "Chat pin status updated successfully"}), 200

    except Exception as e:
        logger.error(f"Error updating chat pin status: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to update chat pin status"}), 500

@chat_bp.route('/<chat_id>', methods=['DELETE'])
@jwt_required()
def delete_chat(chat_id):
    try:
        if not ObjectId.is_valid(chat_id):
            return jsonify({"error": "Invalid chat ID"}), 400

        user_id = get_jwt_identity()
        chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id), "user_id": user_id})

        if not chat:
            return jsonify({"error": "Chat not found or not authorized"}), 404

        # Delete associated queries
        queries_collection.delete_many({"chat_session_id": chat_id})

        # Delete the chat session
        chat_sessions_collection.delete_one({"_id": ObjectId(chat_id)})

        logger.info(f"Deleted chat {chat_id}")
        return jsonify({"message": "Chat deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Error deleting chat: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to delete chat"}), 500

@chat_bp.route('/all', methods=['DELETE'])
@jwt_required()
def delete_all_chats():
    try:
        user_id = get_jwt_identity()

        # Delete all chats and associated queries for the user
        chat_sessions_collection.delete_many({"user_id": user_id})
        queries_collection.delete_many({"user_id": user_id})

        logger.info(f"Deleted all chats for user_id: {user_id}")
        return jsonify({"message": "All chats deleted successfully"}), 200

    except Exception as e:
        logger.error(f"Error deleting all chats: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to delete all chats"}), 500

@chat_bp.route('/<chat_id>/history', methods=['PUT'])
@jwt_required()
def update_chat_history(chat_id):
    try:
        logger.info(f"Received request to update chat history for chat_id: {chat_id}")
        logger.info(f"Request headers: {dict(request.headers)}")
        
        if not ObjectId.is_valid(chat_id):
            logger.warning(f"Invalid chat ID: {chat_id}")
            return jsonify({"error": "Invalid chat ID"}), 400

        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"User ID: {user_id}")
        # Validate user_id as a valid ObjectId
        if not ObjectId.is_valid(user_id):
            logger.warning(f"Invalid ObjectId format for user_id: {user_id}")
            return jsonify({"error": "Invalid user ID format"}), 400

        data = request.get_json()
        logger.info(f"Request payload: {data}")
        new_history = data.get('history')

        if not isinstance(new_history, list):
            logger.warning(f"History is not a list: {new_history}")
            return jsonify({"error": "History must be a list"}), 400

        chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id), "user_id": user_id})
        if not chat:
            logger.info(f"Chat not found or not authorized for chat_id: {chat_id}, user_id: {user_id}")
            return jsonify({"error": "Chat not found or not authorized"}), 404

        update_result = chat_sessions_collection.update_one(
            {"_id": ObjectId(chat_id), "version": chat["version"]},
            {
                "$set": {
                    "history": new_history,
                    "last_updated": datetime.utcnow()
                },
                "$inc": {"version": 1}
            }
        )

        if update_result.modified_count == 0:
            logger.info(f"Failed to update chat history due to concurrent modification for chat_id: {chat_id}")
            return jsonify({"error": "Failed to update chat history due to concurrent modification"}), 409

        logger.info(f"Chat history updated successfully for chat_id: {chat_id}")
        return jsonify({"message": "Chat history updated successfully"}), 200

    except Exception as e:
        logger.error(f"Error updating chat history: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to update chat history"}), 500

@chat_bp.route('/interrupted-requests', methods=['GET'])
@jwt_required()
def get_interrupted_requests():
    try:
        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token during get_interrupted_requests")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"Fetching interrupted requests for user_id: {user_id}")
        # Validate user_id as a valid ObjectId
        if not ObjectId.is_valid(user_id):
            logger.warning(f"Invalid ObjectId format for user_id: {user_id}")
            return jsonify({"error": "Invalid user ID format"}), 400

        user = users_collection.find_one({"_id": ObjectId(user_id)})
        if not user:
            logger.info(f"No user found for user_id: {user_id} in users_collection")
            return jsonify({"error": "User not found"}), 404

        interrupted_requests = user.get("interrupted_requests", [])
        logger.info(f"Returning interrupted requests: {interrupted_requests}")
        return jsonify({"interrupted_requests": interrupted_requests}), 200

    except Exception as e:
        logger.error(f"Error fetching interrupted requests: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to fetch interrupted requests"}), 500

@chat_bp.route('/interrupted-requests', methods=['POST'])
@jwt_required()
def update_interrupted_requests():
    try:
        user_id = get_jwt_identity()
        if not user_id:
            logger.warning("User ID not found in JWT token during update_interrupted_requests")
            return jsonify({"error": "User ID not found"}), 401

        logger.info(f"Updating interrupted requests for user_id: {user_id}")
        # Validate user_id as a valid ObjectId
        if not ObjectId.is_valid(user_id):
            logger.warning(f"Invalid ObjectId format for user_id: {user_id}")
            return jsonify({"error": "Invalid user ID format"}), 400

        data = request.get_json()
        logger.info(f"Request payload: {data}")
        interrupted_requests = data.get('interrupted_requests', [])

        if not isinstance(interrupted_requests, list):
            return jsonify({"error": "Interrupted requests must be a list"}), 400

        update_result = users_collection.update_one(
            {"_id": ObjectId(user_id)},
            {
                "$set": {
                    "interrupted_requests": interrupted_requests,
                    "last_updated": datetime.utcnow()
                }
            },
            upsert=True
        )

        if update_result.modified_count == 0 and update_result.upserted_id is None:
            logger.info(f"Failed to update interrupted requests for user_id: {user_id}")
            return jsonify({"error": "Failed to update interrupted requests"}), 500

        logger.info(f"Interrupted requests updated successfully for user_id: {user_id}")
        return jsonify({"message": "Interrupted requests updated successfully"}), 200

    except Exception as e:
        logger.error(f"Error updating interrupted requests: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to update interrupted requests"}), 500