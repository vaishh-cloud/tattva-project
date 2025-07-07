from flask import Blueprint, request, jsonify, send_from_directory, current_app, g
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request
from utils.db import users_collection, documents_collection, chat_sessions_collection, queries_collection
from utils.file_utils import allowed_file, extract_text_from_pdf, extract_text_from_docx, FileProcessingError
from utils.image_utils import allowed_image, summarize_image, ImageProcessingError
from utils.nlp_utils import load_document, process_document_query
from werkzeug.utils import secure_filename
import os
from io import BytesIO
from docx import Document as DocxDocument
import uuid
from datetime import datetime
import logging
from bson import ObjectId
import time
from werkzeug.exceptions import RequestTimeout
from flask import abort
import hashlib

logger = logging.getLogger(__name__)

document_bp = Blueprint('document', __name__)

@document_bp.before_request
def before_request():
    g.start_time = time.time()
    g.filepath = None
    logger.info(f"Starting request at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}")

@document_bp.after_request
def after_request(response):
    if hasattr(g, 'filepath') and g.filepath and os.path.exists(g.filepath) and not hasattr(g, 'document_id'):
        logger.info(f"Cleaning up temporary file: {g.filepath}")
        os.remove(g.filepath)
    logger.info(f"Request completed in {time.time() - g.start_time:.2f} seconds")
    return response

@document_bp.route('/upload', methods=['POST'])
@jwt_required()
def upload_file():
    start_time = time.time()
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        file_ext = file.filename.rsplit('.', 1)[1].lower()
        is_image = allowed_image(file.filename)
        is_document = allowed_file(file.filename)
        
        if not (is_document or is_image):
            return jsonify({"error": "Only PDF, DOCX, PNG, or JPEG files are allowed"}), 400

        user_id = get_jwt_identity()
        unique_id = str(uuid.uuid4())
        filename = f"doc_{unique_id}.{file_ext}"
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        g.filepath = filepath
        
        file.save(filepath)
        
        # Compute file hash
        sha256_hash = hashlib.sha256()
        with open(filepath, "rb") as f:
            for byte_block in iter(lambda: f.read(65536), b""):
                sha256_hash.update(byte_block)
        file_hash = sha256_hash.hexdigest()
        
        # Check if document is already processed
        existing_doc = documents_collection.find_one({"file_hash": file_hash, "user_id": user_id})
        if existing_doc:
            logger.info(f"Found existing document with hash {file_hash}, returning existing document_id")
            g.document_id = str(existing_doc["_id"])
            return jsonify({
                "message": "File already uploaded",
                "document_id": str(existing_doc["_id"])
            }), 200

        if is_image:
            file_stream = open(filepath, 'rb')
            try:
                summary = summarize_image(file_stream)
                doc_data = {
                    "user_id": user_id,
                    "original_name": secure_filename(file.filename),
                    "stored_name": filename,
                    "upload_date": datetime.utcnow(),
                    "file_type": file_ext,
                    "size": os.path.getsize(filepath),
                    "file_hash": file_hash,
                    "metadata": {
                        "is_image": True,
                        "summary": summary
                    },
                    "version": 1
                }
                result = documents_collection.insert_one(doc_data)
                g.document_id = str(result.inserted_id)
                logger.info(f"Image upload and processing completed in {time.time() - start_time:.2f} seconds")
                return jsonify({
                    "message": "Image uploaded successfully",
                    "document_id": str(result.inserted_id)
                }), 201
            finally:
                file_stream.close()
        else:
            file_stream = open(filepath, 'rb')
            if file_ext == 'pdf':
                extracted_text = extract_text_from_pdf(file_stream)
            else:
                extracted_text = extract_text_from_docx(file_stream)
            file_stream.close()
            
            documents, metadata, _ = load_document(filepath, user_id)
            
            doc_data = {
                "user_id": user_id,
                "original_name": secure_filename(file.filename),
                "stored_name": filename,
                "upload_date": datetime.utcnow(),
                "file_type": file_ext,
                "size": os.path.getsize(filepath),
                "file_hash": file_hash,
                "extracted_text": extracted_text,
                "metadata": metadata,
                "version": 1,
                "chunks": [{
                    "content": doc.page_content,
                    "metadata": doc.metadata,
                    "embedding": doc.metadata.get("embedding", [])
                } for doc in documents] if documents else []
            }
            
            result = documents_collection.insert_one(doc_data)
            g.document_id = str(result.inserted_id)
            
            logger.info(f"Document upload and processing completed in {time.time() - start_time:.2f} seconds")
            return jsonify({
                "message": "File uploaded successfully",
                "document_id": str(result.inserted_id)
            }), 201

    except (FileProcessingError, ImageProcessingError) as e:
        logger.error(f"File processing error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected upload error: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to upload file"}), 500

@document_bp.route('/preview/<filename>', methods=['GET'])
def preview_document(filename):
    try:
        if not filename.startswith('doc_'):
            return jsonify({"error": "Invalid file"}), 400
        
        filepath = os.path.join(current_app.config['UPLOAD_FOLDER'], filename)
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404
        
        file_ext = filename.rsplit('.', 1)[1].lower()
        if file_ext in ['png', 'jpeg', 'jpg']:
            return send_from_directory(
                current_app.config['UPLOAD_FOLDER'],
                filename,
                as_attachment=False,
                mimetype=f'image/{file_ext}'
            )
        elif filename.lower().endswith('.pdf'):
            return send_from_directory(
                current_app.config['UPLOAD_FOLDER'],
                filename,
                as_attachment=False,
                mimetype='application/pdf'
            )
        elif filename.lower().endswith('.docx'):
            doc = DocxDocument(filepath)
            text = "\n".join([para.text for para in doc.paragraphs])
            return jsonify({
                "type": "docx",
                "content": text,
                "filename": filename
            })
        
        return jsonify({"error": "Unsupported file type"}), 400

    except FileProcessingError as e:
        logger.error(f"Preview error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected preview error: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to generate preview"}), 500

@document_bp.route('/cancel-request', methods=['POST'])
@jwt_required()
def cancel_request():
    try:
        data = request.get_json()
        request_id = data.get('request_id')
        if not request_id:
            return jsonify({"error": "Request ID is required"}), 400

        # Store the cancelled request ID in the app's cancelled_requests dictionary
        current_app.cancelled_requests[request_id] = True
        logger.info(f"Request {request_id} marked as cancelled")
        return jsonify({"message": "Request cancelled successfully"}), 200

    except Exception as e:
        logger.error(f"Error cancelling request: {str(e)}", exc_info=True)
        return jsonify({"error": "Failed to cancel request"}), 500

@document_bp.route("/process-document", methods=["POST"])
def process_document():
    start_time = time.time()
    try:
        timing_logs = {}
        step_start = time.time()
        
        user_id = None
        try:
            verify_jwt_in_request()
            user_id = get_jwt_identity()
        except Exception:
            logger.info("No JWT provided, processing as guest")

        file = request.files.get('file')
        query_text = request.form.get("query", "").strip()
        chat_id = request.form.get("chat_id")
        chat_name = request.form.get("chat_name", "New Chat")
        request_id = request.form.get("request_id")

        if not query_text and not file:
            return jsonify({"error": "Query or file must be provided"}), 400

        if not request_id:
            return jsonify({"error": "Request ID is required"}), 400

        logger.info(f"Processing document with user_id: {user_id}, chat_id: {chat_id}, request_id: {request_id}")

        def check_aborted():
            if request_id in current_app.cancelled_requests:
                logger.info(f"Request {request_id} was cancelled")
                abort(499)

        check_aborted()

        document_id = None
        documents = None
        metadata = None
        chat_history = []
        stored_filename = None
        is_image = False
        response = None
        filepath = None
        existing_doc = None

        timing_logs["init"] = time.time() - step_start
        step_start = time.time()

        if file and file.filename != '':
            file_ext = file.filename.rsplit('.', 1)[1].lower()
            is_image = allowed_image(file.filename)
            is_document = allowed_file(file.filename)
            
            if not (is_document or is_image):
                return jsonify({"error": "Invalid file type. Only PDF, DOCX, PNG, or JPEG allowed"}), 400
                
            unique_id = str(uuid.uuid4())
            stored_filename = f"doc_{unique_id}.{file_ext}"
            filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], stored_filename)
            g.filepath = filepath
            file.save(filepath)
            logger.info(f"File saved at {filepath} at {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}")
            
            # Compute file hash
            sha256_hash = hashlib.sha256()
            with open(filepath, "rb") as f:
                for byte_block in iter(lambda: f.read(65536), b""):
                    sha256_hash.update(byte_block)
            file_hash = sha256_hash.hexdigest()
            
            # Check if document is already processed
            if user_id:
                existing_doc = documents_collection.find_one({"file_hash": file_hash, "user_id": user_id})
                if existing_doc:
                    logger.info(f"Found existing document with hash {file_hash}, using existing data")
                    document_id = str(existing_doc["_id"])
                    g.document_id = document_id
                    metadata = existing_doc.get("metadata", {})
                    stored_filename = existing_doc["stored_name"]
                    filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], stored_filename)
                    is_image = metadata.get("is_image", False)
                    if is_image:
                        image_summary = metadata.get("summary", "No summary available")
                        if "summar" in query_text.lower():
                            response = image_summary
                        else:
                            response = process_document_query(
                                filepath,
                                query_text,
                                chat_history,
                                image_context=image_summary,
                                user_id=user_id
                            )
                    else:
                        documents = [
                            type("Document", (), {
                                "page_content": chunk["content"],
                                "metadata": chunk["metadata"]
                            })() for chunk in existing_doc.get("chunks", [])
                        ]

            if not existing_doc:
                check_aborted()
                if is_image:
                    file_stream = open(filepath, 'rb')
                    try:
                        response = summarize_image(file_stream, query_text or "Summarize the content of this image")
                        metadata = {
                            "is_image": True,
                            "summary": response
                        }
                        if user_id:
                            doc_data = {
                                "user_id": user_id,
                                "original_name": secure_filename(file.filename),
                                "stored_name": stored_filename,
                                "upload_date": datetime.utcnow(),
                                "file_type": file_ext,
                                "size": os.path.getsize(filepath),
                                "file_hash": file_hash,
                                "metadata": metadata,
                                "version": 1
                            }
                            result = documents_collection.insert_one(doc_data)
                            document_id = str(result.inserted_id)
                            g.document_id = document_id
                    finally:
                        file_stream.close()
                else:
                    file_stream = open(filepath, 'rb')
                    if file_ext == 'pdf':
                        extracted_text = extract_text_from_pdf(file_stream)
                    else:
                        extracted_text = extract_text_from_docx(file_stream)
                    file_stream.close()
                    
                    check_aborted()
                    
                    documents, metadata, _ = load_document(filepath, user_id)
                    if not documents and not metadata.get("extracted_text"):
                        raise FileProcessingError("Failed to process document content")
                        
                    if user_id:
                        doc_data = {
                            "user_id": user_id,
                            "original_name": secure_filename(file.filename),
                            "stored_name": stored_filename,
                            "upload_date": datetime.utcnow(),
                            "file_type": file_ext,
                            "size": os.path.getsize(filepath),
                            "file_hash": file_hash,
                            "extracted_text": extracted_text,
                            "metadata": metadata,
                            "version": 1,
                            "chunks": [{
                                "content": doc.page_content,
                                "metadata": doc.metadata,
                                "embedding": doc.metadata.get("embedding", [])
                            } for doc in documents] if documents else []
                        }
                        result = documents_collection.insert_one(doc_data)
                        document_id = str(result.inserted_id)
                        g.document_id = document_id
        
        elif chat_id and user_id:
            if ObjectId.is_valid(chat_id):
                chat_session = chat_sessions_collection.find_one({
                    "_id": ObjectId(chat_id),
                    "user_id": user_id
                })
                if chat_session:
                    chat_history = chat_session.get("history", [])
                    document_id = chat_session.get("document_id")
                    if document_id:
                        doc = documents_collection.find_one({"_id": ObjectId(document_id)})
                        if doc:
                            metadata = doc.get("metadata", {})
                            is_image = metadata.get("is_image", False)
                            stored_filename = doc["stored_name"]
                            filepath = os.path.join(current_app.config["UPLOAD_FOLDER"], stored_filename)
                            if is_image:
                                image_summary = metadata.get("summary", "No summary available")
                                if "summar" in query_text.lower():
                                    response = image_summary
                                else:
                                    response = process_document_query(
                                        filepath,
                                        query_text,
                                        chat_history,
                                        image_context=image_summary,
                                        user_id=user_id
                                    )
                            else:
                                documents = [
                                    type("Document", (), {
                                        "page_content": chunk["content"],
                                        "metadata": chunk["metadata"]
                                    })() for chunk in doc.get("chunks", [])
                                ]
                    else:
                        return jsonify({"error": "No document associated with this chat"}), 400
                else:
                    return jsonify({"error": "Chat session not found or not authorized"}), 404
            else:
                logger.warning(f"Invalid chat_id provided: {chat_id}, treating as new chat")
                chat_id = None

        timing_logs["file_processing"] = time.time() - step_start
        step_start = time.time()

        check_aborted()

        if not response:
            response = process_document_query(
                filepath,
                query_text,
                chat_history,
                image_context=None,
                user_id=user_id
            )

        timing_logs["query_processing"] = time.time() - step_start
        step_start = time.time()

        check_aborted()

        if user_id:
            # Ensure chat session exists or create a new one
            if not chat_id or not ObjectId.is_valid(chat_id):
                logger.info(f"Creating new chat session for user_id: {user_id}")
                new_chat = {
                    "user_id": user_id,
                    "name": chat_name,
                    "created_at": datetime.utcnow(),
                    "last_updated": datetime.utcnow(),
                    "pinned": False,
                    "history": [],
                    "document_id": document_id,
                    "version": 1
                }
                result = chat_sessions_collection.insert_one(new_chat)
                chat_id = str(result.inserted_id)
                logger.info(f"Created new chat session with chat_id: {chat_id}")
            else:
                # Verify chat session exists
                chat_session = chat_sessions_collection.find_one({
                    "_id": ObjectId(chat_id),
                    "user_id": user_id
                })
                if not chat_session:
                    logger.warning(f"Chat session not found for chat_id: {chat_id}, creating new one")
                    new_chat = {
                        "user_id": user_id,
                        "name": chat_name,
                        "created_at": datetime.utcnow(),
                        "last_updated": datetime.utcnow(),
                        "pinned": False,
                        "history": [],
                        "document_id": document_id,
                        "version": 1
                    }
                    result = chat_sessions_collection.insert_one(new_chat)
                    chat_id = str(result.inserted_id)
                    logger.info(f"Created new chat session with chat_id: {chat_id}")

            # Prepare history entry
            history_entry = [
                {
                    "type": "user",
                    "content": query_text,
                    "file": {
                        "name": file.filename if file else None,
                        "stored_name": stored_filename
                    } if file else None,
                    "timestamp": datetime.utcnow().isoformat(),
                    "request_id": request_id
                },
                {
                    "type": "response",
                    "content": response,
                    "timestamp": datetime.utcnow().isoformat()
                }
            ]
            logger.info(f"Prepared history entry for chat_id: {chat_id}: {history_entry}")

            # Update chat session with history
            try:
                update_result = chat_sessions_collection.update_one(
                    {"_id": ObjectId(chat_id), "user_id": user_id},
                    {
                        "$push": {"history": {"$each": history_entry}},
                        "$set": {
                            "name": chat_name,
                            "last_updated": datetime.utcnow(),
                            "document_id": document_id
                        },
                        "$inc": {"version": 1}
                    },
                    upsert=True
                )

                if update_result.modified_count > 0 or update_result.upserted_id:
                    logger.info(f"Chat history updated successfully for chat_id: {chat_id}")
                    # Verify the update by fetching the chat session
                    updated_chat = chat_sessions_collection.find_one({"_id": ObjectId(chat_id)})
                    if updated_chat and len(updated_chat.get("history", [])) >= len(history_entry):
                        logger.info(f"Verified: Chat history contains {len(updated_chat['history'])} entries")
                    else:
                        logger.error(f"Verification failed: Chat history not updated correctly for chat_id: {chat_id}")
                else:
                    logger.error(f"Failed to update chat history for chat_id: {chat_id}")
                    return jsonify({"error": "Failed to update chat history"}), 500
            except Exception as e:
                logger.error(f"Error updating chat history: {str(e)}")
                return jsonify({"error": f"Failed to update chat history: {str(e)}"}), 500

            # Update query collection
            query_data = {
                "user_id": user_id,
                "chat_session_id": chat_id,
                "query_text": query_text,
                "response": response,
                "document_id": document_id,
                "timestamp": datetime.utcnow(),
                "version": 1
            }
            queries_collection.insert_one(query_data)
            logger.info(f"Query recorded for chat_id: {chat_id}")

        timing_logs["db_update"] = time.time() - step_start
        logger.info(f"Document processing completed in {time.time() - start_time:.2f} seconds. Timing: {timing_logs}")

        # Clean up cancelled_requests entry
        if request_id in current_app.cancelled_requests:
            del current_app.cancelled_requests[request_id]

        return jsonify({
            "response": response,
            "chat_id": chat_id,
            "document_id": document_id
        })

    except RequestTimeout:
        logger.warning(f"Request timeout after {time.time() - start_time:.2f} seconds")
        return jsonify({"error": "Request timed out"}), 408
    except FileProcessingError as e:
        logger.error(f"File processing error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except ImageProcessingError as e:
        logger.error(f"Image processing error: {str(e)}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(f"Unexpected error during document processing: {str(e)}", exc_info=True)
        return jsonify({"error": f"Failed to process document: {str(e)}"}), 500