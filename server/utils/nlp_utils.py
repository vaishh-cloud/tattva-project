from langchain_community.document_loaders import PyPDFLoader, UnstructuredWordDocumentLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
import logging
import requests
import re
from utils.file_utils import extract_metadata, extract_text_from_pdf, extract_text_from_docx, FileProcessingError
from utils.image_utils import allowed_image
from typing import List, Tuple, Optional, Dict, Any
import os
import time
from datetime import datetime
import hashlib
import numpy as np
from concurrent.futures import ThreadPoolExecutor
import uuid

logger = logging.getLogger(__name__)

# Configuration
embeddings = HuggingFaceEmbeddings(
    model_name=os.getenv("EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
)
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "your_key_here")
TOGETHER_API_URL = os.getenv("TOGETHER_API_URL", "https://api.together.xyz/v1/chat/completions")
LLAMA_MODEL = os.getenv("LLAMA_MODEL", "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free")
MAX_CONTEXT_LENGTH = int(os.getenv("MAX_CONTEXT_LENGTH", 8000))
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 1500))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 200))
MAX_WORKERS = int(os.getenv("MAX_WORKERS", 2))  # Reduced to minimize overhead
BASE_BATCH_SIZE = 8  # Base batch size, will adjust dynamically

def compute_file_hash(file_path: str) -> str:
    """Compute SHA-256 hash of a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(65536), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def embed_documents_batch(documents: List[Any], query: Optional[str] = None) -> List[np.ndarray]:
    """Embed documents in batches with dynamic batch size."""
    # Filter out invalid chunks
    valid_docs = [doc for doc in documents if doc.page_content and isinstance(doc.page_content, str) and len(doc.page_content.strip()) > 0]
    if not valid_docs:
        logger.warning("No valid chunks to embed after filtering")
        return []

    # Dynamic batch size based on document count and query type
    total_docs = len(valid_docs)
    batch_size = min(BASE_BATCH_SIZE, total_docs)  # At least 1 batch
    if query and "summar" in query.lower():
        # For summary queries, process fewer chunks to speed up
        valid_docs = valid_docs[:min(50, total_docs)]  # Limit to 50 chunks for summaries
        batch_size = min(4, total_docs)  # Smaller batch size for faster processing
    logger.info(f"Embedding {len(valid_docs)} chunks with batch size {batch_size}")

    embeddings_list = []
    for i in range(0, len(valid_docs), batch_size):
        batch = valid_docs[i:i + batch_size]
        chunks = [doc.page_content for doc in batch]
        try:
            batch_embeddings = embeddings.embed_documents(chunks)
            embeddings_list.extend([np.array(emb) for emb in batch_embeddings])
        except Exception as e:
            logger.error(f"Error embedding batch {i//batch_size + 1}: {str(e)}")
            # Skip failed batch, continue with remaining
            embeddings_list.extend([np.zeros(embeddings.model_dim)] * len(batch))
    return embeddings_list

def load_document(file_path: str, user_id: Optional[str] = None, query: Optional[str] = None) -> Tuple[Optional[List[Any]], Dict, Any]:
    """Load document, split into chunks, create FAISS index, and return with metadata."""
    timing = {"start": time.time()}
    if not file_path or not os.path.exists(file_path):
        return [], {"extracted_text": ""}, None
    
    try:
        # Compute file hash to check for existing processing
        timing["hash_start"] = time.time()
        file_hash = compute_file_hash(file_path)
        timing["hash"] = time.time() - timing["hash_start"]

        # Check if document is already processed
        from utils.db import documents_collection
        query_db = {"file_hash": file_hash}
        if user_id:
            query_db["user_id"] = user_id
        existing_doc = documents_collection.find_one(query_db)
        if existing_doc and existing_doc.get("chunks"):
            timing["existing_check"] = time.time() - timing["start"]
            logger.info(f"Found existing document with hash {file_hash}, skipping processing")
            split_docs = [
                type("Document", (), {
                    "page_content": chunk["content"],
                    "metadata": chunk["metadata"],
                    "id": chunk["metadata"].get("id", str(uuid.uuid4()))
                })() for chunk in existing_doc["chunks"]
            ]
            metadata = existing_doc.get("metadata", {})
            metadata["extracted_text"] = existing_doc.get("extracted_text", "")
            vector_store = None
            if split_docs:
                embeddings_list = [chunk["embedding"] for chunk in existing_doc["chunks"] if "embedding" in chunk]
                if embeddings_list:
                    embeddings_np = [np.array(emb) for emb in embeddings_list]
                    doc_ids = [doc.id for doc in split_docs]
                    try:
                        vector_store = FAISS.from_documents(split_docs, embeddings, ids=doc_ids)
                    except Exception as e:
                        logger.error(f"Failed to create FAISS index from existing embeddings: {str(e)}")
                        vector_store = None
            timing["total"] = time.time() - timing["start"]
            logger.info(f"Loaded existing document in {timing['total']:.2f} seconds: {timing}")
            return split_docs, metadata, vector_store

        # Check if file is an image
        if allowed_image(file_path):
            timing["image_check"] = time.time() - timing["start"]
            metadata = {
                "is_image": True,
                "extracted_text": "",
                "file_type": os.path.splitext(file_path)[1].lower().lstrip(".")
            }
            logger.info(f"Image file detected: {file_path}, returning empty documents")
            return [], metadata, None

        # Extract metadata
        timing["metadata_start"] = time.time()
        metadata = extract_metadata(file_path)
        timing["metadata"] = time.time() - timing["metadata_start"]
        
        # Extract full text
        timing["text_extract_start"] = time.time()
        file_stream = open(file_path, 'rb')
        if file_path.endswith(".pdf"):
            extracted_text = extract_text_from_pdf(file_stream)
        elif file_path.endswith(".docx"):
            extracted_text = extract_text_from_docx(file_stream)
        else:
            file_stream.close()
            raise FileProcessingError(f"Unsupported file type: {file_path}")
        file_stream.close()
        metadata["extracted_text"] = extracted_text
        timing["text_extract"] = time.time() - timing["text_extract_start"]
        
        # Load document with appropriate loader
        timing["loader_start"] = time.time()
        if file_path.endswith(".pdf"):
            loader = PyPDFLoader(file_path, extract_images=False)
        elif file_path.endswith(".docx"):
            loader = UnstructuredWordDocumentLoader(file_path, mode="elements")
        else:
            raise FileProcessingError(f"Unsupported file type: {file_path}")
        
        docs = list(loader.lazy_load())
        timing["loader"] = time.time() - timing["loader_start"]
        
        # Split documents into chunks in parallel
        timing["splitter_start"] = time.time()
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=CHUNK_SIZE,
            chunk_overlap=CHUNK_OVERLAP,
            separators=["\n\n", "\n", ". ", "? ", "! ", " ", ""],
            is_separator_regex=False
        )
        
        def split_doc(doc):
            try:
                return text_splitter.split_documents([doc])
            except Exception as e:
                logger.error(f"Error splitting document: {str(e)}")
                return []
        
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            split_docs = []
            futures = [executor.submit(split_doc, doc) for doc in docs]
            for future in futures:
                split_docs.extend(future.result())
        timing["splitter"] = time.time() - timing["splitter_start"]
        
        # Identify sections and assign IDs
        timing["section_start"] = time.time()
        section_patterns = {
            "abstract": r"abstract|summary",
            "introduction": r"introduction|background",
            "methods": r"method|methodology|approach|experiment",
            "results": r"result|finding|outcome|data",
            "discussion": r"discussion|conclusion|implication",
            "references": r"reference|bibliography",
            "appendix": r"appendix|supplement"
        }

        for doc in split_docs:
            first_200 = doc.page_content[:200].lower()
            for section, pattern in section_patterns.items():
                if re.search(pattern, first_200):
                    doc.metadata["section"] = section
                    break
            else:
                doc.metadata["section"] = "other"
            doc.metadata["id"] = str(uuid.uuid4())
        timing["section"] = time.time() - timing["section_start"]
        
        # Create FAISS vector store
        timing["faiss_start"] = time.time()
        vector_store = None
        if split_docs:
            embeddings_list = embed_documents_batch(split_docs, query)
            
            # Ensure embeddings and documents align
            valid_pairs = [(doc, emb) for doc, emb in zip(split_docs, embeddings_list) if np.any(emb)]
            if valid_pairs:
                split_docs, embeddings_list = zip(*valid_pairs)
                split_docs = list(split_docs)
                embeddings_list = list(embeddings_list)
            else:
                split_docs = []
                embeddings_list = []

            for doc, embedding in zip(split_docs, embeddings_list):
                doc.metadata["embedding"] = embedding.tolist() if isinstance(embedding, np.ndarray) else embedding
                
            doc_ids = [doc.metadata["id"] for doc in split_docs]
            if split_docs:
                try:
                    vector_store = FAISS.from_documents(split_docs, embeddings, ids=doc_ids)
                    vector_count = vector_store.index.ntotal
                    logger.info(f"FAISS vector store created with {vector_count} vectors for document: {file_path}")
                    if vector_count > 0:
                        sample_vector = vector_store.index.reconstruct(0)
                        logger.debug(f"Sample FAISS vector (first): {sample_vector[:5]}... (length: {len(sample_vector)})")
                    else:
                        logger.warning("FAISS vector store is empty, no vectors stored")
                except Exception as e:
                    logger.error(f"Failed to create FAISS index: {str(e)}")
                    vector_store = None
            else:
                logger.warning("No valid chunks after embedding for FAISS")
        else:
            logger.warning("No document chunks to store in FAISS for document: {file_path}")
        timing["faiss"] = time.time() - timing["faiss_start"]
        
        timing["total"] = time.time() - timing["start"]
        logger.info(f"Document processing timing: {timing}")
        
        return split_docs, metadata, vector_store

    except FileProcessingError as e:
        logger.error(f"Document processing failed: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected document loading error: {str(e)}", exc_info=True)
        raise FileProcessingError(f"Unexpected error loading document: {str(e)}")

def format_metadata(metadata: Dict) -> str:
    """Format document metadata for context"""
    formatted = ["DOCUMENT METADATA:"]
    formatted.append(f"Pages: {metadata.get('total_pages', 'Unknown')}")
    if metadata.get('is_research'):
        formatted.append("Type: Research paper")
    if metadata.get('sections'):
        formatted.append(f"Sections: {', '.join(metadata['sections'])}")
    if metadata.get('is_image'):
        formatted.append(f"Type: Image ({metadata.get('file_type', 'unknown')})")
    return "\n".join(formatted)

def analyze_query_intent(query: str) -> Dict[str, float]:
    """Analyze the intent behind a user query"""
    intent_scores = {
        "casual_chat": 0,
        "summary_request": 0,
        "technical_detail": 0,
        "comparison": 0,
        "metadata_query": 0
    }
    query_lower = query.lower()
    
    keyword_map = {
        "casual_chat": ["hi", "hello", "hey", "what's up", "how are you"],
        "summary_request": ["summarize", "overview", "main points", "tl;dr"],
        "technical_detail": ["method", "result", "data", "analysis", "how does"],
        "comparison": ["vs", "versus", "compare", "difference", "similarity"],
        "metadata_query": ["author", "title", "date", "pages", "figure", "table"]
    }
    
    for intent, keywords in keyword_map.items():
        intent_scores[intent] += sum(keyword in query_lower for keyword in keywords) * 0.3
    
    if re.search(r"explain (like|to) (a|me|i'm)", query_lower):
        intent_scores["casual_chat"] += 0.5
    if re.search(r"\b(advantage|disadvantage|pros?|cons?)\b", query_lower):
        intent_scores["comparison"] += 0.4
    
    total = sum(intent_scores.values())
    if total > 0:
        for intent in intent_scores:
            intent_scores[intent] /= total
    
    return intent_scores

def handle_metadata_query(query: str, metadata: Dict) -> Optional[str]:
    """Handle queries about document metadata"""
    query_lower = query.lower()
    if "pages" in query_lower or "length" in query_lower:
        return f"The document has {metadata.get('total_pages', 'an unknown number of')} pages."
    elif any(term in query_lower for term in ["figure", "image"]):
        return f"There are {metadata.get('figure_count', 0)} figures and {metadata.get('image_count', 0)} images."
    elif "table" in query_lower:
        return f"The document contains {metadata.get('table_count', 0)} tables."
    elif "sections" in query_lower or "contents" in query_lower:
        if metadata.get("sections"):
            return "Main sections: " + ", ".join(metadata["sections"])
        return "The document structure information isn't available."
    elif metadata.get("is_image") and ("type" in query_lower or "format" in query_lower):
        return f"The file is an image of type {metadata.get('file_type', 'unknown')}."
    return None

def prepare_context(query: str, documents: List, metadata: Dict, intent_scores: Dict, chat_history: List = None, vector_store=None, image_context: str = None) -> str:
    """Prepare context for LLM using FAISS similarity search and section filtering"""
    context_parts = []
    
    if image_context:
        context_parts.append(f"IMAGE SUMMARY:\n{image_context}")

    if intent_scores["metadata_query"] > 0.3:
        context_parts.append(format_metadata(metadata))

    if chat_history:
        history_str = "\n".join(
            f"{entry['type'].upper()}: {entry['content']}" for entry in chat_history[-5:]
        )
        context_parts.append(f"PREVIOUS CONVERSATION:\n{history_str}")
        query_lower = query.lower()
        for entry in chat_history[-5:]:
            if entry["type"] == "user" and any(word in query_lower for word in entry["content"].lower().split()):
                context_parts.append(f"NOTE: You previously asked about '{entry['content']}', which may be related.")

    if documents:
        relevant_docs = []
        
        if vector_store:
            relevant_docs = vector_store.similarity_search(query, k=5)
            retrieved_sections = [doc.metadata.get('section', 'other') for doc in relevant_docs]
            logger.info(f"FAISS retrieved {len(relevant_docs)} documents for query '{query}': Sections {retrieved_sections}")
        else:
            logger.warning(f"No FAISS vector store available, using section-based filtering for query: {query}")
            if intent_scores["technical_detail"] > 0.5:
                sections = ["methods", "results"]
            elif intent_scores["comparison"] > 0.4:
                sections = ["results", "discussion"]
            else:
                sections = ["abstract", "introduction", "conclusion"]
                
            relevant_docs = [d for d in documents if d.metadata.get("section") in sections]
            if not relevant_docs and documents:
                relevant_docs = documents[:3]
            retrieved_sections = [doc.metadata.get('section', 'other') for doc in relevant_docs]
            logger.info(f"Fallback retrieved {len(relevant_docs)} documents for query '{query}': Sections {retrieved_sections}")
        
        context_content = "\n\n".join(
            f"[Section: {doc.metadata.get('section', 'other')}]\n{doc.page_content}"
            for doc in relevant_docs[:5]
        )
        
        if len(context_content) > MAX_CONTEXT_LENGTH:
            last_paragraph_end = context_content[:MAX_CONTEXT_LENGTH].rfind("\n\n")
            context_content = context_content[:last_paragraph_end] if last_paragraph_end > 0 else context_content[:MAX_CONTEXT_LENGTH]
        
        context_parts.append("DOCUMENT CONTENT:\n" + context_content)

    return "\n\n".join(context_parts)

def determine_response_style(intent_scores: Dict, metadata: Dict) -> Dict:
    """Determine the appropriate response style based on query intent"""
    style = {
        "tone": "professional",
        "structure": "paragraph",
        "depth": "detailed"
    }
    
    if intent_scores["casual_chat"] > 0.5:
        style["tone"] = "friendly"
    elif intent_scores["technical_detail"] > 0.6 and metadata.get("is_research"):
        style["tone"] = "academic"
    
    if intent_scores["comparison"] > 0.4:
        style["structure"] = "table"
    elif intent_scores["summary_request"] > 0.5:
        style["structure"] = "bullet"
    
    return style

def generate_llm_prompt(query: str, context: str, response_style: Dict) -> str:
    """Generate the final prompt for the LLM"""
    prompt_parts = []
    instruction = f"""You are an AI assistant with {response_style['tone']} tone. Respond with:
    - Depth: {response_style['depth']}
    - Structure: {response_style['structure']}
    - Style: Adapt to user's apparent knowledge level
    - Instruction: If relevant, reference prior conversation to maintain continuity."""
    
    if response_style["structure"] == "table":
        instruction += "\nFormat comparisons or lists as markdown tables when helpful"
    
    prompt_parts.append(instruction)
    
    if context:
        prompt_parts.append(f"CONTEXT:\n{context}")
    
    prompt_parts.append(f"USER QUERY:\n{query}")
    
    if "explain like i'm 5" in query.lower():
        prompt_parts.append("USE: Simple analogies, avoid jargon, max 3 sentences")
    if "advantages and disadvantages" in query.lower():
        prompt_parts.append("STRUCTURE: Bullet points for pros/cons with 1-sentence explanations")
    
    return "\n\n".join(prompt_parts)

def call_llm_api(prompt: str) -> str:
    """Call the LLM API with the prepared prompt"""
    try:
        headers = {
            "Authorization": f"Bearer {TOGETHER_API_KEY}",
            "Content-Type": "application/json"
        }
        data = {
            "model": LLAMA_MODEL,
            "messages": [{"role": "system", "content": prompt}],
            "temperature": 0.7 if "casual" in prompt.lower() else 0.3,
            "max_tokens": 1500
        }
        
        response = requests.post(TOGETHER_API_URL, json=data, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]
    
    except requests.Timeout:
        logger.error("LLM API request timed out")
        return "Request to AI service timed out. Please try again later."
    except requests.RequestException as e:
        logger.error(f"LLM API request failed: {str(e)}")
        return f"Failed to connect to AI service: {str(e)}"
    except KeyError as e:
        logger.error(f"Invalid LLM API response format: {str(e)}")
        return "Received an invalid response from the AI service."

def process_document_query(file_path: str, query: str, chat_history: List = None, image_context: str = None, user_id: Optional[str] = None) -> str:
    """Main function to process a document query"""
    timing = {"start": time.time()}
    
    try:
        timing["load_start"] = time.time()
        documents, metadata, vector_store = load_document(file_path, user_id, query)
        timing["load"] = time.time() - timing["load_start"]
        
        timing["intent_start"] = time.time()
        intent_scores = analyze_query_intent(query)
        timing["intent"] = time.time() - timing["intent_start"]
        
        if intent_scores["metadata_query"] > 0.7:
            metadata_response = handle_metadata_query(query, metadata)
            if metadata_response:
                return metadata_response
        
        timing["context_start"] = time.time()
        context = prepare_context(query, documents, metadata, intent_scores, chat_history, vector_store, image_context)
        timing["context"] = time.time() - timing["context_start"]
        
        timing["style_start"] = time.time()
        response_style = determine_response_style(intent_scores, metadata)
        timing["style"] = time.time() - timing["style_start"]
        
        timing["prompt_start"] = time.time()
        prompt = generate_llm_prompt(query, context, response_style)
        timing["prompt"] = time.time() - timing["prompt_start"]
        
        timing["llm_start"] = time.time()
        response = call_llm_api(prompt)
        timing["llm"] = time.time() - timing["llm_start"]
        
        timing["total"] = time.time() - timing["start"]
        logger.info(f"Document query processing timing: {timing}")
        
        return response
    
    except FileProcessingError as e:
        logger.error(f"Document processing error: {str(e)}")
        return f"Error processing document: {str(e)}"
    except Exception as e:
        logger.error(f"Unexpected error processing query: {str(e)}", exc_info=True)
        return f"An unexpected error occurred: {str(e)}"