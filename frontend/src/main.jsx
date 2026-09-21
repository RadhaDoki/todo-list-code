import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const api = (path, options = {}) => fetch(`/api${path}`, {
  headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  ...options
});

function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [todos, setTodos] = useState([]);
  const [newList, setNewList] = useState("");
  const [newTodo, setNewTodo] = useState("");
  const [message, setMessage] = useState("");

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  async function requestOtp() {
    setMessage("");
    const res = await api("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    setMessage(data.error || data.message);
  }

  async function verifyOtp() {
    const res = await api("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ email, otp })
    });
    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error);
      return;
    }

    localStorage.setItem("token", data.token);
    setToken(data.token);
    setMessage("Login successful");
  }

  async function loadLists() {
    const res = await api("/lists", { headers: authHeaders });
    if (res.status === 401) return logout();
    const data = await res.json();
    setLists(data);
    if (!selectedList && data.length) setSelectedList(data[0]);
  }

  async function loadTodos(listId) {
    const res = await api(`/lists/${listId}/todos`, { headers: authHeaders });
    const data = await res.json();
    setTodos(data);
  }

  async function createList() {
    if (!newList.trim()) return;
    const res = await api("/lists", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ name: newList })
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error);
    setNewList("");
    await loadLists();
    setSelectedList(data);
  }

  async function deleteList(id) {
    await api(`/lists/${id}`, { method: "DELETE", headers: authHeaders });
    if (selectedList?.id === id) {
      setSelectedList(null);
      setTodos([]);
    }
    await loadLists();
  }

  async function createTodo() {
    if (!selectedList || !newTodo.trim()) return;
    const res = await api(`/lists/${selectedList.id}/todos`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ title: newTodo })
    });
    const data = await res.json();
    if (!res.ok) return setMessage(data.error);
    setNewTodo("");
    setTodos(prev => [data, ...prev]);
  }

  async function updateTodo(todo) {
    const title = window.prompt("Edit todo", todo.title);
    if (title === null || !title.trim()) return;

    const res = await api(`/todos/${todo.id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ title, completed: todo.completed })
    });
    const data = await res.json();
    if (res.ok) setTodos(prev => prev.map(t => t.id === data.id ? data : t));
  }

  async function toggleTodo(todo) {
    const res = await api(`/todos/${todo.id}`, {
      method: "PUT",
      headers: authHeaders,
      body: JSON.stringify({ title: todo.title, completed: !todo.completed })
    });
    const data = await res.json();
    if (res.ok) setTodos(prev => prev.map(t => t.id === data.id ? data : t));
  }

  async function deleteTodo(id) {
    await api(`/todos/${id}`, { method: "DELETE", headers: authHeaders });
    setTodos(prev => prev.filter(t => t.id !== id));
  }

  function logout() {
    localStorage.removeItem("token");
    setToken(null);
    setLists([]);
    setTodos([]);
    setSelectedList(null);
  }

  useEffect(() => {
    if (token) loadLists();
  }, [token]);

  useEffect(() => {
    if (token && selectedList) loadTodos(selectedList.id);
  }, [selectedList?.id, token]);

  if (!token) {
    return (
      <main className="login">
        <div className="card">
          <h1>Todo DevOps Lab</h1>
          <p>Login using your email address and OTP.</p>
          <input
            placeholder="Email address"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
          />
          <button onClick={requestOtp}>Send OTP</button>
          <input
            placeholder="6-digit OTP"
            value={otp}
            onChange={e => setOtp(e.target.value.replace(/\D/g, ""))}
            maxLength="6"
          />
          <button onClick={verifyOtp}>Verify & Login</button>
          {message && <p className="message">{message}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="app">
      <header>
        <h1>My Todo Lists</h1>
        <button className="secondary" onClick={logout}>Logout</button>
      </header>

      <section className="layout">
        <aside className="sidebar">
          <h2>Lists</h2>
          <div className="row">
            <input
              placeholder="New list"
              value={newList}
              onChange={e => setNewList(e.target.value)}
            />
            <button onClick={createList}>+</button>
          </div>

          {lists.map(list => (
            <div
              className={`list-item ${selectedList?.id === list.id ? "active" : ""}`}
              key={list.id}
              onClick={() => setSelectedList(list)}
            >
              <span>{list.name}</span>
              <button
                className="danger"
                onClick={e => { e.stopPropagation(); deleteList(list.id); }}
              >×</button>
            </div>
          ))}
        </aside>

        <section className="content">
          <h2>{selectedList?.name || "Select or create a list"}</h2>
          {selectedList && (
            <>
              <div className="row">
                <input
                  placeholder="What needs to be done?"
                  value={newTodo}
                  onChange={e => setNewTodo(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createTodo()}
                />
                <button onClick={createTodo}>Add</button>
              </div>

              <ul className="todos">
                {todos.map(todo => (
                  <li key={todo.id} className={todo.completed ? "completed" : ""}>
                    <input
                      type="checkbox"
                      checked={todo.completed}
                      onChange={() => toggleTodo(todo)}
                    />
                    <span>{todo.title}</span>
                    <button onClick={() => updateTodo(todo)}>Edit</button>
                    <button className="danger" onClick={() => deleteTodo(todo.id)}>Delete</button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {message && <p className="message">{message}</p>}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
