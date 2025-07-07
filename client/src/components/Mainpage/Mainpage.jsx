import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { UploadCloud, Send, Plus, FileText, Loader2, AlertTriangle, Paperclip, Search, Pin, Trash2, Edit, ChevronLeft, ChevronRight, X, Copy, Trash, User, LogOut, Settings, Moon, Sun, LogIn, UserPlus, AlertCircle, MessageSquare, RefreshCw, Image as ImageIcon, Square } from "lucide-react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github.css";
import mammoth from "mammoth";
import "./Mainpage.css";

// Component for previewing documents (PDF, DOCX, or Images)
function DocumentPreview({ file, filename, onClose }) {
  const [fileContent, setFileContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchPreview = async () => {
      try {
        if (file) {
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
            reader.onload = async (e) => {
              const arrayBuffer = e.target.result;
              const result = await mammoth.extractRawText({ arrayBuffer });
              setFileContent({
                type: "docx",
                text: result.value
              });
              setLoading(false);
            };
            reader.readAsArrayBuffer(file);
          } else if (file.type.startsWith("image/")) {
            reader.onload = (e) => {
              setFileContent({
                type: "image",
                url: e.target.result
              });
              setLoading(false);
            };
            reader.readAsDataURL(file);
          } else {
            setError("Unsupported file type for preview");
            setLoading(false);
          }
        } else if (filename) {
          const token = localStorage.getItem('token');
          const response = await axios.get(`http://localhost:5000/document/preview/${filename}`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: filename.match(/\.(pdf|png|jpeg|jpg)$/i) ? 'blob' : 'json'
          });

          if (filename.endsWith('.pdf')) {
            setFileContent({
              type: "pdf",
              url: URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }))
            });
          } else if (filename.endsWith('.docx')) {
            setFileContent({
              type: "docx",
              text: response.data.content
            });
          } else if (filename.match(/\.(png|jpeg|jpg)$/i)) {
            setFileContent({
              type: "image",
              url: URL.createObjectURL(new Blob([response.data], { type: `image/${filename.split('.').pop().toLowerCase()}` }))
            });
          }
          setLoading(false);
        }
      } catch (err) {
        setError("Error fetching or reading file preview");
        setLoading(false);
        console.error(err);
      }
    };

    fetchPreview();

    return () => {
      if (fileContent?.url) {
        URL.revokeObjectURL(fileContent.url);
      }
    };
  }, [file, filename]);

  return (
    <div className="DocumentPreview">
      <div className="PreviewHeader">
        <h3>{file?.name || filename || "Document Preview"}</h3>
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
        ) : fileContent?.type === "pdf" ? (
          <embed
            src={fileContent.url}
            type="application/pdf"
            width="100%"
            height="100%"
          />
        ) : fileContent?.type === "docx" ? (
          <div className="DocxPreview">
            <pre>{fileContent.text}</pre>
          </div>
        ) : fileContent?.type === "image" ? (
          <div className="ImagePreview">
            <img src={fileContent.url} alt="Preview" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
  if (!isOpen) return null;

  return (
    <div className="ModalOverlay">
      <div className="ConfirmationModal">
        <h3>{title}</h3>
        <p>{message}</p>
        <div className="ModalActions">
          <button className="ModalButton cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="ModalButton confirm" onClick={onConfirm}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function Mainpage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    const isGuest = !storedUser && !token;
    if (isGuest) {
      localStorage.setItem('isGuest', 'true');
    } else {
      localStorage.removeItem('isGuest');
    }
    return storedUser ? JSON.parse(storedUser) : { isGuest: true };
  });
  const [isGuestWarningVisible, setIsGuestWarningVisible] = useState(localStorage.getItem('isGuest') === 'true');
  const [chats, setChats] = useState(() => {
    if (user?.isGuest) {
      // For guest users, start with one new chat on page load
      const newChat = {
        id: Date.now().toString(),
        name: "New Chat",
        history: [],
        pinned: false
      };
      return [newChat];
    }
    const guestChats = localStorage.getItem('guestChats');
    return guestChats ? JSON.parse(guestChats) : [];
  });
  const [currentChat, setCurrentChat] = useState(() => {
    if (user?.isGuest) {
      return chats[0]?.id || null;
    }
    return null;
  });
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [previewFilename, setPreviewFilename] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [showClearChatModal, setShowClearChatModal] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [interruptedRequests, setInterruptedRequests] = useState(() => {
    if (user?.isGuest) {
      return new Set();
    }
    const stored = localStorage.getItem('interruptedRequests');
    return stored ? new Set(JSON.parse(stored)) : new Set();
  });
  const isCreatingChatRef = useRef(false);
  const initialChatIdRef = useRef(localStorage.getItem('initialChatId') || null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatAreaRef = useRef(null);
  const accountMenuRef = useRef(null);
  const historyListRef = useRef(null);
  const hasInitializedChatsRef = useRef(false);

  useEffect(() => {
    let debounceTimeout;
    const updateUser = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        const storedUser = localStorage.getItem('user');
        const token = localStorage.getItem('token');
        const isGuest = !storedUser && !token;
        const newUser = storedUser ? JSON.parse(storedUser) : { isGuest: true };

        setUser(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(newUser)) {
            console.log("Updating user:", newUser);
            hasInitializedChatsRef.current = false;
            if (isGuest) {
              // For guest users, ensure only one new chat on user update (e.g., page refresh)
              const newChat = {
                id: Date.now().toString(),
                name: "New Chat",
                history: [],
                pinned: false
              };
              setChats([newChat]);
              setCurrentChat(newChat.id);
              localStorage.removeItem('guestChats'); // Clear any stored chats for guests
            }
            return newUser;
          }
          return prev;
        });
        setIsGuestWarningVisible(isGuest);
        if (isGuest) {
          localStorage.setItem('isGuest', 'true');
        } else {
          localStorage.removeItem('isGuest');
        }
      }, 100);
    };

    updateUser();
    window.addEventListener('storage', updateUser);

    const fetchUserPreferences = async () => {
      if (!user.isGuest) {
        try {
          const token = localStorage.getItem('token');
          const response = await axios.get('http://localhost:5000/auth/preferences', {
            headers: { Authorization: `Bearer ${token}` }
          });
          setIsDarkMode(response.data.preferences.theme === 'dark');
        } catch (err) {
          console.error("Error fetching user preferences:", err);
        }
      }
    };

    fetchUserPreferences();

    return () => {
      window.removeEventListener('storage', updateUser);
      clearTimeout(debounceTimeout);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const initializeChats = async () => {
      if (hasInitializedChatsRef.current) {
        console.log("Chats already initialized for this session, skipping...");
        return;
      }

      if (isCreatingChatRef.current) {
        console.log("Chat creation already in progress, skipping...");
        return;
      }

      if (!user) {
        console.log("No user, skipping chat initialization");
        return;
      }

      // Skip initialization for guest users since we handle their chat in the state initialization and user update
      if (user.isGuest) {
        hasInitializedChatsRef.current = true;
        return;
      }

      try {
        let fetchedChats = [];
        if (!user.isGuest) {
          await fetchChatHistory(controller.signal).then(chats => {
            fetchedChats = chats;
          });
        } else {
          fetchedChats = chats;
        }

        if (!user.isGuest) {
          fetchedChats.sort((a, b) => parseInt(b.id) - parseInt(a.id));

          const mostRecentChat = fetchedChats[0];
          const hasNonEmptyChat = mostRecentChat && mostRecentChat.history.length > 0;

          if (fetchedChats.length === 0 || hasNonEmptyChat) {
            isCreatingChatRef.current = true;
            try {
              const newChatId = await handleNewChat();
              initialChatIdRef.current = newChatId;
              localStorage.setItem('initialChatId', newChatId);
              console.log("Created new chat for login:", newChatId);
            } finally {
              isCreatingChatRef.current = false;
            }
          } else {
            const emptyChat = fetchedChats.find(chat => chat.history.length === 0);
            if (emptyChat) {
              setCurrentChat(emptyChat.id);
              initialChatIdRef.current = emptyChat.id;
              localStorage.setItem('initialChatId', emptyChat.id);
              console.log("Reusing existing empty chat:", emptyChat.id);
            }
          }
        }

        hasInitializedChatsRef.current = true;
      } catch (err) {
        if (axios.isCancel(err)) {
          console.log("Chat initialization aborted");
        } else {
          console.error("Error initializing chats:", err);
        }
      }
    };

    const debounceTimeout = setTimeout(() => {
      initializeChats();
    }, 100);

    return () => {
      clearTimeout(debounceTimeout);
      controller.abort();
    };
  }, [user?.isGuest]);

  useEffect(() => {
    if (!user?.isGuest) {
      localStorage.setItem('interruptedRequests', JSON.stringify([...interruptedRequests]));
    }
  }, [interruptedRequests, user?.isGuest]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target)) {
        setShowAccountMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (historyListRef.current) {
      historyListRef.current.scrollTop = historyListRef.current.scrollHeight;
    }
  }, [chats]);

  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [chats, isLoading]);

  const fetchChatHistory = async (signal) => {
    if (user.isGuest) return chats;

    try {
      const token = localStorage.getItem('token');
      let serverInterruptedRequests = new Set();
      if (user && !user.isGuest) {
        const interruptedResponse = await axios.get('http://localhost:5000/chat/interrupted-requests', {
          headers: { Authorization: `Bearer ${token}` },
          signal
        });
        serverInterruptedRequests = new Set(interruptedResponse.data.interrupted_requests);
        setInterruptedRequests(serverInterruptedRequests);
        localStorage.setItem('interruptedRequests', JSON.stringify([...serverInterruptedRequests]));
      }

      const response = await axios.get('http://localhost:5000/chat/history', {
        headers: { Authorization: `Bearer ${token}` },
        signal
      });
      const fetchedChats = response.data.chats
        .map(chat => ({
          id: chat.id,
          name: chat.name,
          history: chat.history || [],
          pinned: chat.pinned
        }))
        .filter(chat => {
          const updatedHistory = chat.history.filter((entry, index) => {
            if (entry.type === "response") {
              const userMessage = chat.history[index - 1];
              if (userMessage && userMessage.request_id && serverInterruptedRequests.has(userMessage.request_id)) {
                return false;
              }
            }
            return true;
          });
          chat.history = updatedHistory;
          return true;
        })
        .sort((a, b) => parseInt(b.id) - parseInt(a.id));

      setChats(prev => {
        if (JSON.stringify(prev) !== JSON.stringify(fetchedChats)) {
          console.log("Updating chats:", fetchedChats);
          return fetchedChats;
        }
        return prev;
      });

      if (fetchedChats.length === 0) {
        localStorage.removeItem('initialChatId');
      }

      return fetchedChats;
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log("Chat history fetch aborted");
      } else {
        console.error("Error fetching chat history:", err);
      }
      return chats;
    }
  };

  const handleLogout = async () => {
    if (initialChatIdRef.current) {
      const initialChat = chats.find(chat => chat.id === initialChatIdRef.current);
      if (initialChat && initialChat.history.length === 0) {
        try {
          if (!user.isGuest) {
            const token = localStorage.getItem('token');
            await axios.delete(`http://localhost:5000/chat/${initialChatIdRef.current}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
          }
          setChats(prev => prev.filter(chat => chat.id !== initialChatIdRef.current));
        } catch (err) {
          console.error("Error deleting unused initial chat:", err);
        }
      }
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("initialChatId");
    localStorage.removeItem("guestChatId");
    localStorage.removeItem("guestChats");
    localStorage.removeItem("interruptedRequests");
    localStorage.setItem("isGuest", "true");
    setUser({ isGuest: true });
    setChats([]);
    setCurrentChat(null);
    setIsGuestWarningVisible(true);
    initialChatIdRef.current = null;
    hasInitializedChatsRef.current = false;
    setInterruptedRequests(new Set());
  };

  const getCurrentChat = () => {
    const chat = chats.find((chat) => chat.id === currentChat);
    return chat || { id: null, history: [], name: "" };
  };

  const handleFileSelection = (event) => {
    const file = event.target.files[0];
    if (file) {
      processFile(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    processFile(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFile = (file) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg'
    ];
    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.type)) {
      console.error("Unsupported file type. Please upload only PDF, DOCX, PNG, or JPEG files.");
      setSelectedFile(null);
    } else if (file.size > maxSize) {
      console.error("File size exceeds 10MB limit.");
      setSelectedFile(null);
    } else {
      setSelectedFile(file);
      setError(null);
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const syncChatHistoryToServer = async (chatId, history) => {
    if (user && !user.isGuest) {
      let retries = 3;
      while (retries > 0) {
        try {
          const token = localStorage.getItem('token');
          const serializableHistory = history.map(entry => {
            const { file, ...rest } = entry;
            return {
              ...rest,
              file: file ? { name: file.name, stored_name: file.stored_name || null } : null
            };
          });

          const response = await axios.put(`http://localhost:5000/chat/${chatId}/history`, {
            history: serializableHistory
          }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          console.log(`Synced history for chat ${chatId}`);
          const chatResponse = await axios.get(`http://localhost:5000/chat/${chatId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (chatResponse.data.history.length === history.length) {
            console.log(`Verified: Server history matches local history for chat ${chatId}`);
            return true;
          } else {
            console.warn(`History length mismatch for chat ${chatId}: server=${chatResponse.data.history.length}, local=${history.length}`);
          }
        } catch (err) {
          console.error(`Error syncing chat history to server (attempt ${4 - retries}):`, err);
          retries--;
          if (retries === 0) {
            setError("Failed to sync chat history to server after multiple attempts.");
            return false;
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    return true;
  };

  const syncInterruptedRequestsToServer = async () => {
    if (user && !user.isGuest) {
      try {
        const token = localStorage.getItem('token');
        await axios.post('http://localhost:5000/chat/interrupted-requests', {
          interrupted_requests: [...interruptedRequests]
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        console.log("Synced interrupted requests");
      } catch (err) {
        console.error("Error syncing interrupted requests to server:", err);
      }
    }
  };

  const handleQuerySubmit = async (isSummary = false) => {
    if ((query.trim() !== "" || selectedFile) && !isLoading) {
      const controller = new AbortController();
      setAbortController(controller);
      setIsLoading(true);
      setError(null);

      const requestId = Date.now().toString();

      const isAutoSummary = selectedFile && query.trim() === "";
      const effectiveQuery = isAutoSummary
        ? (selectedFile.type.startsWith("image/")
          ? "Summarize the content of this image"
          : "Summarize the document")
        : query.trim();

      const userMessage = {
        type: "user",
        content: effectiveQuery,
        file: selectedFile ? { name: selectedFile.name, stored_name: null } : null,
        timestamp: new Date().toLocaleTimeString(),
        request_id: requestId
      };

      let chatId = currentChat;

      if (!chatId) {
        const newChatId = await handleNewChat();
        chatId = newChatId;
        setCurrentChat(newChatId);
      }

      setChats(prevChats => {
        const updatedChats = prevChats.map(chat => {
          if (chat.id === chatId) {
            return {
              ...chat,
              history: [...(chat.history || []), userMessage]
            };
          }
          return chat;
        });
        if (!user?.isGuest) {
          localStorage.setItem('guestChats', JSON.stringify(updatedChats));
        }
        return updatedChats;
      });

      if (user && !user.isGuest) {
        const currentHistory = getCurrentChat().history || [];
        await syncChatHistoryToServer(chatId, [...currentHistory, userMessage]);
      }

      const currentChatData = chats.find(chat => chat.id === chatId) || { history: [], name: "New Chat" };
      const shouldRename = selectedFile && (currentChatData.history.length === 1 || currentChatData.name === "New Chat");
      const chatName = shouldRename
        ? selectedFile.name.replace(/\.(pdf|docx|png|jpeg|jpg)$/i, "")
        : currentChatData.name || "New Chat";

      if (shouldRename && user && !user.isGuest) {
        try {
          const token = localStorage.getItem('token');
          await axios.put(`http://localhost:5000/chat/${chatId}/rename`, {
            name: chatName
          }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          setChats(prevChats => prevChats.map(chat => 
            chat.id === chatId ? { ...chat, name: chatName } : chat
          ));
        } catch (err) {
          console.error("Error renaming chat:", err);
        }
      }

      const formData = new FormData();
      if (selectedFile) formData.append('file', selectedFile);
      formData.append('query', effectiveQuery);
      formData.append('chat_id', chatId);
      formData.append('chat_name', chatName);
      formData.append('request_id', requestId);

      try {
        const token = localStorage.getItem('token');
        const response = await axios.post('http://localhost:5000/document/process-document', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
            ...(token && { Authorization: `Bearer ${token}` })
          },
          signal: controller.signal
        });

        if (interruptedRequests.has(requestId)) {
          console.log(`Ignoring response for interrupted request ${requestId}`);
          return;
        }

        const responseEntry = {
          type: "response",
          content: response.data.response,
          timestamp: new Date().toLocaleTimeString(),
        };

        setChats(prevChats => {
          const updatedChats = prevChats.map(chat => {
            if (chat.id === chatId) {
              return {
                ...chat,
                history: [...chat.history, responseEntry]
              };
            }
            return chat;
          });
          if (!user?.isGuest) {
            localStorage.setItem('guestChats', JSON.stringify(updatedChats));
          }
          return updatedChats;
        });

        if (user && !user.isGuest) {
          const currentHistory = getCurrentChat().history || [];
          await syncChatHistoryToServer(chatId, [...currentHistory, userMessage, responseEntry]);
        }

        const serverChatId = response.data.chat_id;
        if (serverChatId && serverChatId !== chatId) {
          console.log(`Updating chat_id from ${chatId} to ${serverChatId}`);
          setCurrentChat(serverChatId);
          setChats(prevChats => {
            const chatExists = prevChats.some(chat => chat.id === serverChatId);
            if (!chatExists) {
              return [{ id: serverChatId, name: chatName, history: [userMessage, responseEntry], pinned: false }, ...prevChats.filter(chat => chat.id !== chatId)];
            }
            return prevChats.map(chat => 
              chat.id === chatId ? { ...chat, id: serverChatId } : chat
            );
          });
          await fetchChatHistory();
        }

        if (!isSummary && !isAutoSummary) setQuery("");
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      } catch (error) {
        if (axios.isCancel(error)) {
          console.log("Request was aborted by user at", new Date().toLocaleTimeString());
          setInterruptedRequests(prev => {
            const newSet = new Set(prev);
            newSet.add(requestId);
            if (!user?.isGuest) {
              localStorage.setItem('interruptedRequests', JSON.stringify([...newSet]));
            }
            return newSet;
          });

          await syncInterruptedRequestsToServer();

          const interruptionEntry = {
            type: "system",
            content: "Request was interrupted by the user.",
            timestamp: new Date().toLocaleTimeString(),
          };

          setChats(prevChats => {
            const updatedChats = prevChats.map(chat => {
              if (chat.id === chatId) {
                return {
                  ...chat,
                  history: [...chat.history, interruptionEntry]
                };
              }
              return chat;
            });
            if (!user?.isGuest) {
              localStorage.setItem('guestChats', JSON.stringify(updatedChats));
            }
            return updatedChats;
          });

          if (user && !user.isGuest) {
            await syncChatHistoryToServer(chatId, [...getCurrentChat().history, interruptionEntry]);
            const token = localStorage.getItem('token');
            try {
              await axios.post('http://localhost:5000/document/cancel-request', {
                request_id: requestId
              }, {
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                }
              });
            } catch (cancelError) {
              console.error("Error notifying backend of cancellation:", cancelError.response?.data?.error || cancelError.message);
              setError("Failed to notify backend of cancellation. The request was still interrupted locally.");
            }
          }
          return;
        }

        const errorMessage = error.response?.status === 499
          ? "Request was interrupted by the client."
          : error.response?.data?.error || "An unexpected error occurred";
        console.error("Error during query submission:", errorMessage, error);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
        setAbortController(null);
      }
    }
  };

  const handleNewChat = async () => {
    const newChat = {
      id: Date.now().toString(),
      name: "New Chat",
      history: [],
      pinned: false
    };

    if (user && !user.isGuest) {
      try {
        const token = localStorage.getItem('token');
        const response = await axios.post('http://localhost:5000/chat/create', {
          name: "New Chat"
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        newChat.id = response.data.chat_id;
        setChats(prev => [newChat, ...prev]);
        setCurrentChat(newChat.id);
      } catch (err) {
        console.error("Error creating new chat:", err);
        setChats(prev => [newChat, ...prev]);
        setCurrentChat(newChat.id);
      }
    } else {
      // For guest users, replace the existing chat with a new one to ensure only one chat exists
      setChats([newChat]);
      setCurrentChat(newChat.id);
    }

    setQuery("");
    setSelectedFile(null);
    setError(null);

    return newChat.id;
  };

  const deleteChat = async (chatId, e) => {
    e.stopPropagation();

    if (window.confirm("Are you sure you want to delete this chat?")) {
      try {
        if (user && !user.isGuest) {
          const token = localStorage.getItem('token');
          await axios.delete(`http://localhost:5000/chat/${chatId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log(`Successfully deleted chat ${chatId} from backend`);
        }

        const updatedChats = chats.filter(chat => chat.id !== chatId);
        setChats(updatedChats);
        if (!user?.isGuest) {
          localStorage.setItem('guestChats', JSON.stringify(updatedChats));
        }

        if (currentChat === chatId) {
          if (updatedChats.length > 0) {
            setCurrentChat(updatedChats[0].id);
          } else {
            setCurrentChat(null);
            // For guest users, create a new chat immediately after deletion to maintain exactly one chat
            if (user?.isGuest) {
              const newChatId = await handleNewChat();
              setCurrentChat(newChatId);
            }
          }
        }

        if (chatId === initialChatIdRef.current) {
          initialChatIdRef.current = null;
          localStorage.removeItem('initialChatId');
        }

        if (user && !user.isGuest) {
          await fetchChatHistory();
        }
      } catch (err) {
        console.error("Error deleting chat:", err);
        setError("Failed to delete chat. Please try again.");
      }
    }
  };

  const editChat = async (chatId, e) => {
    e.stopPropagation();

    const chat = chats.find(c => c.id === chatId);
    if (!chat) return;

    const newName = prompt("Enter new chat name:", chat.name);
    if (newName && newName.trim() !== "") {
      try {
        const updatedChats = chats.map(c => {
          if (c.id === chatId) {
            return { ...c, name: newName.trim() };
          }
          return c;
        });
        setChats(updatedChats);
        if (!user?.isGuest) {
          localStorage.setItem('guestChats', JSON.stringify(updatedChats));
        }

        if (user && !user.isGuest) {
          const token = localStorage.getItem('token');
          await axios.put(`http://localhost:5000/chat/${chatId}/rename`, {
            name: newName.trim()
          }, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
        }
      } catch (err) {
        console.error("Error renaming chat:", err);
      }
    }
  };

  const pinChat = async (chatId, e) => {
    e.stopPropagation();

    try {
      const chat = chats.find(c => c.id === chatId);
      if (!chat) return;

      const newPinnedStatus = !chat.pinned;

      const updatedChats = chats.map(c => {
        if (c.id === chatId) {
          return { ...c, pinned: newPinnedStatus };
        }
        return c;
      });
      setChats(updatedChats);
      if (!user?.isGuest) {
        localStorage.setItem('guestChats', JSON.stringify(updatedChats));
      }

      if (user && !user.isGuest) {
        const token = localStorage.getItem('token');
        await axios.put(`http://localhost:5000/chat/${chatId}/pin`, {
          pinned: newPinnedStatus
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }
    } catch (err) {
      console.error("Error toggling pin status:", err);
    }
  };

  const clearChat = () => {
    if (chats.length > 0) {
      setShowClearChatModal(true);
    }
  };

  const handleClearChatConfirm = async () => {
    try {
      setChats([]);
      setCurrentChat(null);
      initialChatIdRef.current = null;
      localStorage.removeItem('initialChatId');
      localStorage.removeItem('guestChatId');
      localStorage.removeItem('guestChats');
      localStorage.removeItem('interruptedRequests');
      hasInitializedChatsRef.current = false;
      setInterruptedRequests(new Set());

      if (user && !user.isGuest) {
        const token = localStorage.getItem('token');
        await axios.delete(`http://localhost:5000/chat/all`, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        // For guest users, create a new chat after clearing to maintain exactly one chat
        const newChatId = await handleNewChat();
        setCurrentChat(newChatId);
      }
    } catch (err) {
      console.error("Error clearing all chats:", err);
    } finally {
      setShowClearChatModal(false);
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

  const editMessage = async (index) => {
    const chat = getCurrentChat();
    const message = chat.history[index];
    if (message.type === "user") {
      const newContent = prompt("Edit your message:", message.content);
      if (newContent && newContent.trim() !== "") {
        setChats(prevChats => {
          const updatedChats = prevChats.map(c => {
            if (c.id === currentChat) {
              const updatedHistory = [...c.history];
              updatedHistory[index] = { ...message, content: newContent.trim() };
              return { ...c, history: updatedHistory };
            }
            return c;
          });
          if (!user?.isGuest) {
            localStorage.setItem('guestChats', JSON.stringify(updatedChats));
          }
          return updatedChats;
        });
        if (user && !user.isGuest) {
          await syncChatHistoryToServer(currentChat, getCurrentChat().history);
        }
      }
    }
  };

  const deleteMessage = async (index) => {
    if (window.confirm("Delete this message?")) {
      setChats(prevChats => {
        const updatedChats = prevChats.map(c => {
          if (c.id === currentChat) {
            const updatedHistory = c.history.filter((_, i) => i !== index);
            return { ...c, history: updatedHistory };
          }
          return c;
        });
        if (!user?.isGuest) {
          localStorage.setItem('guestChats', JSON.stringify(updatedChats));
        }
        return updatedChats;
      });
      if (user && !user.isGuest) {
        await syncChatHistoryToServer(currentChat, getCurrentChat().history);
      }
    }
  };

  const filteredChats = chats
    .filter((chat) => chat.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return parseInt(b.id) - parseInt(a.id);
    });

  const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);

  const handleAccountClick = () => {
    if (isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
    setShowAccountMenu(!showAccountMenu);
  };

  const openFilePreview = (file, filename) => {
    setPreviewFile(file);
    setPreviewFilename(filename);
    setIsSidebarCollapsed(true);
  };

  const closePreview = () => {
    setPreviewFile(null);
    setPreviewFilename(null);
  };

  const toggleDarkMode = async () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);

    if (user && !user.isGuest) {
      try {
        const token = localStorage.getItem('token');
        await axios.put('http://localhost:5000/auth/preferences', {
          preferences: { theme: newDarkMode ? 'dark' : 'light' }
        }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (err) {
        console.error("Error saving dark mode preference:", err);
      }
    }
  };

  useEffect(() => {
    inputRef.current?.focus();
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
    document.body.className = isDarkMode ? "dark-mode" : "";
  }, [chats, currentChat, isDarkMode]);

  const Message = ({ item, index }) => {
    return (
      <div className={`MessageWrapper ${item.type}`}>
        <div className="MessageActions">
          {item.type === "response" && (
            <button onClick={() => copyToClipboard(item.content)} title="Copy response">
              <Copy size={16} />
            </button>
          )}
        </div>
        {item.type === "user" && (
          <div className="ChatBubble UserBubble">
            <div className="MessageHeader">
              <User size={16} />
              <span className="Timestamp">{item.timestamp}</span>
            </div>
            <div className="MessageContent">
              {item.content}
              {item.file && item.file.name && (
                <div
                  className="FileAttachment"
                  onClick={() => {
                    const fileObj = item.file instanceof File ? item.file : null;
                    const filename = item.file.stored_name || (item.file instanceof File ? null : item.file.name);
                    openFilePreview(fileObj, filename);
                  }}
                >
                  {item.file.name.match(/\.(png|jpeg|jpg)$/i) ? <ImageIcon size={16} /> : <FileText size={16} />}
                  <span>{item.file.name || "Attached Document"}</span>
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
                  code({ node, inline, className, children, ...props }) {
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
                  table({ children }) {
                    return <div className="table-container"><table>{children}</table></div>;
                  }
                }}
              >
                {item.content}
              </ReactMarkdown>
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

        {item.type === "system" && (
          <div className="ChatBubble" style={{ marginRight: "auto", backgroundColor: isDarkMode ? "#4a5568" : "#e3e8ef", color: isDarkMode ? "#e0e0e0" : "#333" }}>
            <div className="MessageHeader">
              <AlertCircle size={16} />
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
    <div className={`Mainpage ${isDarkMode ? "dark-mode" : ""}`}>
      <div className={`Sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
        <div className="SidebarTop">
          <button className="CollapseButton" onClick={toggleSidebar}>
            {isSidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          {!isSidebarCollapsed && <h1 className="AppTitle">Tattva</h1>}
          <button className="NewChatButton" onClick={handleNewChat}>
            {isSidebarCollapsed ? <Plus size={20} /> : <><Plus size={20} /> New Chat</>}
          </button>
        </div>

        {isSidebarCollapsed ? (
          <ul className="HistoryList" ref={historyListRef}>
            {filteredChats.map((chat) => (
              <li
                key={chat.id}
                className={`HistoryItem ${chat.id === currentChat ? "active" : ""} ${chat.pinned ? "pinned" : ""}`}
                onClick={() => setCurrentChat(chat.id)}
                title={chat.name}
              >
                <MessageSquare size={20} />
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="SearchBox">
              <Search size={18} />
              <input
                type="text"
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="SidebarHeader">
              <h2 className="SidebarTitle">History</h2>
              {currentChat && (
                <button className="ClearChatButton" onClick={clearChat} title="Clear all chats">
                  <Trash size={16} />
                </button>
              )}
            </div>
            <ul className="HistoryList" ref={historyListRef}>
              {filteredChats.map((chat) => (
                <li
                  key={chat.id}
                  className={`HistoryItem ${chat.id === currentChat ? "active" : ""} ${chat.pinned ? "pinned" : ""}`}
                  onClick={() => setCurrentChat(chat.id)}
                >
                  <span className="ChatName">{chat.name}</span>
                  <div className="ChatActions">
                    <button title="Edit chat name" onClick={(e) => editChat(chat.id, e)}>
                      <Edit size={16} />
                    </button>
                    <button title="Delete chat" onClick={(e) => deleteChat(chat.id, e)}>
                      <Trash2 size={16} />
                    </button>
                    <button
                      title={chat.pinned ? "Unpin chat" : "Pin chat"}
                      onClick={(e) => pinChat(chat.id, e)}
                      style={{ color: chat.id === currentChat ? '#004aad' : 'white' }}
                    >
                      <Pin size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="SidebarBottom">
          <div className="AccountSection">
            <button className="AccountButton" onClick={handleAccountClick}>
              <User size={20} />
              {!isSidebarCollapsed && <span>{user?.username || (user?.isGuest ? 'Guest' : 'Account')}</span>}
            </button>
            {showAccountMenu && (
              <div className="AccountMenu" ref={accountMenuRef}>
                {user && !user.isGuest ? (
                  <>
                    <div className="AccountInfo">
                      <div className="AccountEmail">{user.email}</div>
                      <div className="AccountUsername">@{user.username}</div>
                    </div>
                    <button onClick={toggleDarkMode}>
                      {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
                      {isDarkMode ? "Light Mode" : "Dark Mode"}
                    </button>
                    <button onClick={() => {
                      if (window.confirm("Are you sure you want to delete your account? This cannot be undone.")) {
                        alert("Account deletion would be implemented here");
                      }
                    }}>
                      <Trash2 size={18} /> Delete Account
                    </button>
                    <button onClick={handleLogout}>
                      <LogOut size={18} /> Logout
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => navigate('/login')}>
                      <LogIn size={18} /> Sign In
                    </button>
                    <button onClick={() => navigate('/login', { state: { showRegister: true } })}>
                      <UserPlus size={18} /> Register
                    </button>
                    <div className="GuestWarning">
                      <AlertCircle size={18} />
                      <span>Guest session - history won't be saved</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`RightPanel ${previewFile || previewFilename ? "with-preview" : ""}`}>
        {isGuestWarningVisible && (
          <div
            style={{
              position: 'fixed',
              top: '10px',
              right: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              backgroundColor: '#ffcc00',
              color: '#333',
              padding: '12px 20px',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              zIndex: 1000,
              maxWidth: '400px',
            }}
          >
            <AlertCircle size={20} />
            <span>Guest Mode: Chat history is not saved. Sign in to keep your history.</span>
            <button
              onClick={() => setIsGuestWarningVisible(false)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>
        )}
        <div
          className="ChatContainer"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {isDragging && (
            <div className="DragDropOverlay">
              <UploadCloud size={48} />
              <p>Drop your file here</p>
            </div>
          )}
          <div className="ChatArea" ref={chatAreaRef}>
            {getCurrentChat().history.length > 0 ? (
              getCurrentChat().history.map((item, index) => (
                <Message key={index} item={item} index={index} />
              ))
            ) : (
              <div className="WelcomeMessage">
                <div className="WelcomeIllustration">
                  <FileText size={48} />
                </div>
                <h3>Welcome to Tattva</h3>
                {user?.isGuest && (
                  <div className="GuestNotification">
                    <AlertTriangle size={18} />
                    <p>You're in guest mode. Your chat history won't be saved.</p>
                  </div>
                )}
                <p>Upload a research paper, image, or ask a question to get started.</p>
                <div className="TipsSection">
                  <h4>Try asking:</h4>
                  <ul>
                    <li>"Summarize the key findings of this paper"</li>
                    <li>"What methodology did the authors use?"</li>
                    <li>"Explain the results section"</li>
                    <li>"Summarize this image"</li>
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
                accept=".pdf,.docx,.png,.jpeg,.jpg"
                onChange={handleFileSelection}
                hidden
              />
            </label>
            <textarea
              ref={inputRef}
              placeholder="Ask a question or upload a paper/image..."
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
              className={`SendButton ${isLoading ? "interrupting" : ""}`}
              onClick={() => {
                if (isLoading) {
                  if (abortController) {
                    abortController.abort();
                    setIsLoading(false);
                    setAbortController(null);
                  }
                } else {
                  handleQuerySubmit();
                }
              }}
              disabled={!isLoading && (query.trim() === "" && !selectedFile)}
              title={isLoading ? "Stop processing" : "Send message"}
            >
              {isLoading ? <Square size={22} /> : <Send size={22} />}
            </button>
          </div>
          {selectedFile && (
            <div className="FilePreview">
              <div className="FileInfo">
                {selectedFile.name.match(/\.(png|jpeg|jpg)$/i) ? <ImageIcon size={18} /> : <FileText size={18} />}
                <span>{selectedFile.name}</span>
              </div>
              <div className="FileActions">
                <button onClick={removeFile} title="Remove file">
                  <X size={18} />
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="ErrorNotification">
              <AlertTriangle size={18} />
              <span>{error}</span>
              <button onClick={() => setError(null)} title="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {(previewFile || previewFilename) && (
          <DocumentPreview
            file={previewFile}
            filename={previewFilename}
            onClose={closePreview}
          />
        )}
      </div>

      <ConfirmationModal
        isOpen={showClearChatModal}
        onClose={() => setShowClearChatModal(false)}
        onConfirm={handleClearChatConfirm}
        title="Clear All Chats"
        message="Are you sure you want to delete all chat sessions? This action cannot be undone."
      />
    </div>
  );
}

export default Mainpage;