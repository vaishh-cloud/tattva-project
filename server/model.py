import os
import traceback
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from langchain_community.document_loaders import PyPDFLoader, UnstructuredFileLoader, Docx2txtLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
import re

app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Together AI Configuration
TOGETHER_API_KEY = "a0513536d729f1490095b4ac5ae083ec73848d45c72957c91fce94f684463f82"
TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
LLAMA_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free"

# Initialize Embedding Model
embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# Global variables
current_documents = None
current_vectorstore = None

# System prompts
RESEARCH_SYSTEM_PROMPT = """You are an AI research assistant. When answering questions:
1. For document-specific queries, use only the provided context
2. For general questions, use your knowledge
3. Always maintain academic tone for research questions
4. Format responses clearly with sections when appropriate"""

GENERAL_SYSTEM_PROMPT = """You are a helpful AI assistant. Provide accurate, concise answers to general questions."""

def load_document(file_path):
    """Extract text from supported files."""
    try:
        if file_path.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
        elif file_path.endswith(".docx"):
            loader = Docx2txtLoader(file_path)
        elif file_path.endswith(".txt"):
            loader = UnstructuredFileLoader(file_path)
        else:
            return None

        docs = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000, 
            chunk_overlap=200,
            separators=["\n\n", "\n", " ", ""]
        )
        return text_splitter.split_documents(docs)
    except Exception as e:
        print(f"Error loading document: {e}")
        return None

def extract_key_terms(text, n=20):
    """Extract important terms from text for relevance detection."""
    words = re.findall(r'\b\w{4,}\b', text.lower())
    freq = {}
    for word in words:
        freq[word] = freq.get(word, 0) + 1
    return sorted(freq.keys(), key=lambda x: freq[x], reverse=True)[:n]

def is_document_related(query, documents):
    """Improved relevance detection with multiple strategies."""
    if not documents:
        return False
    
    # Get document context
    doc_text = " ".join([doc.page_content for doc in documents[:3]])
    key_terms = extract_key_terms(doc_text)
    
    # Check for conceptual questions about paper content
    conceptual_phrases = [
        'what is', 'explain', 'define', 'how does',
        'what are', 'tell me about', 'describe', 'meaning of'
    ]
    
    # Check for acronyms in the document
    doc_acronyms = set(re.findall(r'\b[A-Z]{2,}\b', doc_text))
    
    query_lower = query.lower()
    
    # Multiple relevance conditions
    return (
        any(term in query_lower for term in key_terms) or
        any(acronym in query for acronym in doc_acronyms) or
        any(phrase in query_lower for phrase in conceptual_phrases) or
        any(term in query_lower for term in ['paper', 'study', 'research', 'author'])
    )

def generate_response(query, context="", is_research=False):
    """Generate appropriate response based on context."""
    system_prompt = RESEARCH_SYSTEM_PROMPT if (is_research and context) else GENERAL_SYSTEM_PROMPT
    
    if not context:
        user_content = query
    else:
        user_content = f"Context: {context[:3000]}\n\nQuestion: {query}"
    
    try:
        headers = {
            "Authorization": f"Bearer {TOGETHER_API_KEY}",
            "Content-Type": "application/json"
        }

        data = {
            "model": LLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "max_tokens": 1500,
            "temperature": 0.4 if is_research else 0.7
        }

        response = requests.post(TOGETHER_API_URL, json=data, headers=headers)
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"API request error: {e}")
        return "I encountered an error processing your request."

@app.route("/process-document", methods=["POST"])
def process_document():
    global current_documents, current_vectorstore

    query = request.form.get("query", "").strip()
    file = request.files.get("file")

    response_data = {
        "response": "",
        "document_text": "",
        "is_research": False,
        "source": "general"  # or "document"
    }

    try:
        # Handle file upload
        if file:
            file_path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
            file.save(file_path)
            documents = load_document(file_path)
            
            if not documents:
                return jsonify({"error": "Unsupported file type or corrupt file"}), 400
                
            current_vectorstore = FAISS.from_documents(documents, embeddings)
            current_documents = documents
            response_data["is_research"] = is_research_paper(documents)
            response_data["document_text"] = " ".join([doc.page_content for doc in documents[:2]])
            
            # If no query, generate summary
            if not query:
                response_data["response"] = generate_response(
                    "Provide a structured summary of this document",
                    response_data["document_text"],
                    response_data["is_research"]
                )
                response_data["source"] = "document"
                return jsonify(response_data)
        
        # Process query
        if query:
            if current_documents and is_document_related(query, current_documents):
                retriever = current_vectorstore.as_retriever(search_kwargs={"k": 3})
                context_docs = retriever.get_relevant_documents(query)
                context = " ".join([doc.page_content for doc in context_docs])
                response_data["response"] = generate_response(
                    query, 
                    context,
                    response_data["is_research"]
                )
                response_data["source"] = "document"
            else:
                # General conversation
                response_data["response"] = generate_response(query)
                response_data["source"] = "general"
        
        return jsonify(response_data)

    except Exception as e:
        print(traceback.format_exc())
        return jsonify({"error": str(e)}), 500
    finally:
        if file and 'file_path' in locals() and os.path.exists(file_path):
            os.remove(file_path)

def is_research_paper(documents):
    """Check if document appears to be academic."""
    sample_text = " ".join([doc.page_content for doc in documents[:2]]).lower()
    return any(term in sample_text for term in 
              ["abstract", "introduction", "method", "result", "conclusion"])

if __name__ == "__main__":
    app.run(debug=True, port=5001)