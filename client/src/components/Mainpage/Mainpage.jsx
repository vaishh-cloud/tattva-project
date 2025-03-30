import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { UploadCloud, Send, Plus, FileText, Loader2, AlertTriangle, Paperclip, Search, Pin, Trash2, Edit, ChevronLeft, X, Copy, Trash, User, LogOut, Settings, Moon, Sun } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github.css";
import "./Mainpage.css";

function DocumentPreview({ file, onClose }) {
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const readFile = () => {
      try {
        const reader = new FileReader();
        
        if (file.type === "application/pdf") {
          reader.onload = (e) => {
            setFileContent({
              type: "pdf",
              url: URL.createObjectURL(new Blob([e.target.result], { type: "application/pdf" }))
            });
            setLoading(false);
          };
          reader.readAsArrayBuffer(file);
        } else if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
          // For DOCX files, we'll just show a message since rendering is complex
          setFileContent({
            type: "docx",
            name: file.name
          });
          setLoading(false);
        } else {
          setError("Unsupported file type for preview");
          setLoading(false);
        }
      } catch (err) {
        setError("Error reading file");
        setLoading(false);
      }
    };

    readFile();

    return () => {
      if (fileContent?.url) {
        URL.revokeObjectURL(fileContent.url);
      }
    };
  }, [file]);

  return (
    <div className="DocumentPreview">
      <div className="PreviewHeader">
        <h3>{file.name}</h3>
        <button onClick={onClose} className="ClosePreviewButton">
          <X size={20} />
        </button>
      </div>
      
      <div className="PreviewContent">
        {loading ? (
          <div className="LoadingPreview">
            <Loader2 className="animate-spin" size={24} />
            <span>Loading preview...</span>
          </div>
        ) : error ? (
          <div className="PreviewError">
            <AlertTriangle size={24} />
            <p>{error}</p>
          </div>
        ) : fileContent.type === "pdf" ? (
          <embed 
            src={fileContent.url} 
            type="application/pdf" 
            width="100%" 
            height="100%" 
          />
        ) : (
          <div className="UnsupportedPreview">
            <FileText size={48} />
            <p>Preview not available for DOCX files</p>
            <p>You can still ask questions about this document</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Mainpage() {
  const [chats, setChats] = useState([{ id: 1, history: [], pinned: false, name: "New Chat" }]);
  const [currentChat, setCurrentChat] = useState(1);
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatAreaRef = useRef(null);

  const getCurrentChat = () => chats.find((chat) => chat.id === currentChat);

  const handleFileSelection = (event) => {
    const file = event.target.files[0];
    processFile(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    processFile(file);
  };

  const processFile = (file) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      setError("Please upload only PDF or DOCX files.");
      setSelectedFile(null);
    } else if (file.size > maxSize) {
      setError("File size exceeds 10MB limit.");
      setSelectedFile(null);
    } else {
      setSelectedFile(file);
      setChats((prev) =>
        prev.map((chat) =>
          chat.id === currentChat ? { ...chat, name: file.name.split('.')[0] } : chat
        )
      );
      setError(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleQuerySubmit = async (isSummary = false) => {
    if ((query.trim() !== "" || selectedFile || isSummary) && !isLoading) {
      setIsLoading(true);
      setError(null);

      // Add user message to history immediately
      const userMessage = {
        type: "user",
        content: isSummary ? "Summarize the document" : query.trim(),
        file: selectedFile ? selectedFile : null,
        timestamp: new Date().toLocaleTimeString(),
      };
      updateHistory(userMessage);

      const formData = new FormData();
      if (selectedFile) formData.append('file', selectedFile);
      formData.append('query', isSummary ? "Summarize the document" : query.trim());

      try {
        const response = await axios.post('http://localhost:5001/process-document', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });

        const responseEntry = {
          type: "response",
          content: response.data.response,
          timestamp: new Date().toLocaleTimeString(),
        };

        updateHistory(responseEntry);
        if (!isSummary) setQuery("");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        const errorMessage = error.response?.data?.error || "An unexpected error occurred";
        updateHistory({ 
          type: "error", 
          content: errorMessage, 
          timestamp: new Date().toLocaleTimeString() 
        });
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const updateHistory = (entry) => {
    setChats((prevChats) =>
      prevChats.map((chat) =>
        chat.id === currentChat ? { ...chat, history: [...chat.history, entry] } : chat
      )
    );
  };

  const handleNewChat = () => {
    const newChatId = Date.now();
    setChats([...chats, { id: newChatId, history: [], pinned: false, name: "New Chat" }]);
    setCurrentChat(newChatId);
    setQuery("");
    setSelectedFile(null);
    setError(null);
  };

  const deleteChat = (chatId) => {
    if (window.confirm("Are you sure you want to delete this chat?")) {
      setChats((prev) => prev.filter((chat) => chat.id !== chatId));
      if (currentChat === chatId && chats.length > 1) {
        setCurrentChat(chats.find(chat => chat.id !== chatId).id);
      }
    }
  };

  const editChat = (chatId) => {
    const newName = prompt("Enter new chat name:", chats.find((chat) => chat.id === chatId).name);
    if (newName && newName.trim() !== "") {
      setChats((prev) =>
        prev.map((chat) => (chat.id === chatId ? { ...chat, name: newName.trim() } : chat))
      );
    }
  };

  const pinChat = (chatId) => {
    setChats((prev) =>
      prev.map((chat) => (chat.id === chatId ? { ...chat, pinned: !chat.pinned } : chat))
    );
  };

  const clearChat = () => {
    if (window.confirm("Clear all messages in this chat?")) {
      setChats((prev) =>
        prev.map((chat) => (chat.id === currentChat ? { ...chat, history: [] } : chat))
      );
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    const notification = document.createElement("div");
    notification.className = "copy-notification";
    notification.textContent = "Copied to clipboard!";
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  };

  const filteredChats = chats
    .filter((chat) => chat.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.pinned - a.pinned);

  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  const openFilePreview = (file) => {
    setPreviewFile(file);
  };

  const closePreview = () => {
    setPreviewFile(null);
  };

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  const handleLogout = () => {
    alert("Logged out successfully!");
    setShowAccountMenu(false);
  };

  useEffect(() => {
    inputRef.current?.focus();
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
    document.body.className = isDarkMode ? "dark-mode" : "";
  }, [chats, isDarkMode]);

  const Message = ({ item }) => {
    return (
      <div className={`MessageWrapper ${item.type}`}>
        {item.type === "user" && (
          <div className="ChatBubble UserBubble">
            <div className="MessageHeader">
              <User size={16} />
              <span className="Timestamp">{item.timestamp}</span>
            </div>
            <div className="MessageContent">
              {item.content}
              {item.file && (
                <div className="FileAttachment" onClick={() => openFilePreview(item.file)}>
                  <FileText size={16} />
                  <span>{item.file.name}</span>
                </div>
              )}
            </div>
          </div>
        )}
        
        {item.type === "response" && (
          <div className="ChatBubble ResponseBubble">
            <div className="MessageHeader">
              <div className="BotIcon">🤖</div>
              <span className="Timestamp">{item.timestamp}</span>
            </div>
            <div className="MessageContent">
              <ReactMarkdown
                rehypePlugins={[rehypeHighlight]}
                remarkPlugins={[remarkGfm]}
                components={{
                  code({node, inline, className, children, ...props}) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <div className="code-block">
                        <div className="code-header">
                          <span>{match ? match[1] : 'code'}</span>
                          <button 
                            onClick={() => copyToClipboard(String(children))}
                            title="Copy code"
                          >
                            <Copy size={14} />
                          </button>
                        </div>
                        <code className={className} {...props}>
                          {children}
                        </code>
                      </div>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  table({children}) {
                    return <div className="table-container"><table>{children}</table></div>;
                  }
                }}
              >
                {item.content}
              </ReactMarkdown>
            </div>
            <div className="MessageActions">
              <button onClick={() => copyToClipboard(item.content)} title="Copy response">
                <Copy size={16} />
              </button>
            </div>
          </div>
        )}
        
        {item.type === "error" && (
          <div className="ChatBubble ErrorBubble">
            <div className="MessageHeader">
              <AlertTriangle size={16} />
              <span className="Timestamp">{item.timestamp}</span>
            </div>
            <div className="MessageContent">
              {item.content}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`Mainpage ${isDarkMode ? "dark-mode" : ""}`} onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
      <div className={`Sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="SidebarTop">
          <h1 className="AppTitle">InsightPaper</h1>
          <button className="NewChatButton" onClick={handleNewChat}>
            <Plus size={20} /> {!isSidebarCollapsed && "New Chat"}
          </button>
        </div>
        {!isSidebarCollapsed && (
          <>
            <div className="SearchBox">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="ClearSearchButton" onClick={() => setSearchQuery("")}>
                  <X size={16} />
                </button>
              )}
            </div>
            <div className="SidebarHeader">
              <h2 className="SidebarTitle">History</h2>
              <button className="ClearChatButton" onClick={clearChat} title="Clear current chat">
                <Trash size={16} />
              </button>
            </div>
            <ul className="HistoryList">
              {filteredChats.map((chat) => (
                <li
                  key={chat.id}
                  className={`HistoryItem ${chat.id === currentChat ? "active" : ""} ${chat.pinned ? "pinned" : ""}`}
                  onClick={() => setCurrentChat(chat.id)}
                >
                  {chat.pinned && <Pin size={16} />}
                  <span className="ChatName">{chat.name}</span>
                  <div className="ChatActions">
                    <button title="Edit chat name" onClick={(e) => { e.stopPropagation(); editChat(chat.id); }}>
                      <Edit size={16} />
                    </button>
                    <button title="Delete chat" onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}>
                      <Trash2 size={16} />
                    </button>
                    <button title={chat.pinned ? "Unpin chat" : "Pin chat"} onClick={(e) => { e.stopPropagation(); pinChat(chat.id); }}>
                      <Pin size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <div className="AccountSection">
              <button className="AccountButton" onClick={() => setShowAccountMenu(!showAccountMenu)}>
                <User size={20} />
                {!isSidebarCollapsed && <span>Account</span>}
              </button>
              {showAccountMenu && (
                <div className="AccountMenu">
                  <button onClick={toggleDarkMode}>
                    {isDarkMode ? <Sun size={18} /> : <Moon size={18} />} 
                    {isDarkMode ? "Light Mode" : "Dark Mode"}
                  </button>
                  <button onClick={() => alert("Settings coming soon!")}>
                    <Settings size={18} /> Settings
                  </button>
                  <button onClick={handleLogout}>
                    <LogOut size={18} /> Logout
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <button className="CollapseButton" onClick={toggleSidebar}>
        <ChevronLeft size={20} style={{ transform: isSidebarCollapsed ? "rotate(180deg)" : "none" }} />
      </button>

      <div className={`RightPanel ${previewFile ? "with-preview" : ""}`}>
        <div className="ChatContainer">
          <div className="ChatArea" ref={chatAreaRef}>
            {getCurrentChat().history.length > 0 ? (
              getCurrentChat().history.map((item, index) => (
                <Message key={index} item={item} />
              ))
            ) : (
              <div className="WelcomeMessage">
                <div className="WelcomeIllustration">
                  <FileText size={48} />
                </div>
                <h3>Welcome to InsightPaper</h3>
                <p>Upload a research paper or ask a question to get started.</p>
                <div className="TipsSection">
                  <h4>Try asking:</h4>
                  <ul>
                    <li>"Summarize the key findings of this paper"</li>
                    <li>"What methodology did the authors use?"</li>
                    <li>"Explain the results section"</li>
                    <li>"What are the limitations of this study?"</li>
                  </ul>
                </div>
              </div>
            )}
            {isLoading && (
              <div className="LoadingIndicator">
                <Loader2 className="animate-spin" size={24} />
                <span>Processing your request...</span>
              </div>
            )}
          </div>

          <div className="QueryBox">
            <label className="UploadLabel">
              <Paperclip size={22} className="UploadIcon" />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileSelection}
                hidden
              />
            </label>
            <textarea
              ref={inputRef}
              placeholder="Ask a question or upload a paper..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleQuerySubmit();
                }
              }}
              className="QueryInput"
              disabled={isLoading}
              rows={1}
            />
            <button 
              className="SummaryButton" 
              onClick={() => handleQuerySubmit(true)} 
              disabled={isLoading || !selectedFile}
              title="Summarize document"
            >
              Summarize
            </button>
            <button 
              className="SendButton" 
              onClick={handleQuerySubmit} 
              disabled={isLoading || (query.trim() === "" && !selectedFile)}
              title="Send message"
            >
              {isLoading ? <Loader2 className="animate-spin" size={22} /> : <Send size={22} />}
            </button>
          </div>
          {selectedFile && (
            <div className="FilePreview">
              <div className="FileInfo">
                <FileText size={18} />
                <span>{selectedFile.name}</span>
              </div>
              <button onClick={removeFile} title="Remove file">
                <X size={18} />
              </button>
            </div>
          )}
          {error && (
            <div className="ErrorNotification">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={() => setError(null)}>
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {previewFile && (
          <div className="DocumentPreviewContainer">
            <DocumentPreview file={previewFile} onClose={closePreview} />
          </div>
        )}
      </div>
    </div>
  );
}

export default Mainpage;