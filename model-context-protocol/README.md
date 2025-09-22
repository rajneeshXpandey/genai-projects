# 🌐 Model Context Protocol (MCP)

MCP is a communication layer that provides Claude with **context and tools** without requiring you to write tedious integration code.  
Think of it as a way to **shift the burden of tool definitions and execution** away from your server to specialized MCP servers.

When you first encounter MCP, you’ll see diagrams showing the basic architecture:  

- An **MCP Client** (your server)  
- Connecting to **MCP Servers** that contain **tools, prompts, and resources**  

Each MCP Server acts as an interface to some outside service.

![MCP Architecture Diagram](images/001.png)

---

## ❓ The Problem MCP Solves

Let’s say you’re building a chat interface where users can ask Claude about their GitHub data.  

![MCP Architecture Diagram](images/002.png)

**Example request:**  
👉 “What open pull requests are there across all my repositories?”  

To handle this, Claude needs tools to access **GitHub’s API**.  

![MCP Architecture Diagram](images/003.png)

But GitHub has **massive functionality** (repositories, pull requests, issues, projects, etc.).  
Without MCP, you’d need to:  

- Create a large number of **tool schemas and functions**  
- Write, test, and maintain **all that integration code**  
- Handle **ongoing updates and maintenance**  

⚠️ That’s a huge effort and long-term burden.

---

## ⚙️ How MCP Works

MCP shifts this burden by moving **tool definitions and execution** from your server to **dedicated MCP servers**.  

![MCP Architecture Diagram](images/004.png)

Instead of you authoring all those GitHub tools:  

- An **MCP Server for GitHub** handles it.  
- It wraps GitHub functionality and exposes it as a **standardized set of tools**.  
- Your app connects to the MCP server instead of implementing everything from scratch.

✅ This means less code for you, more power for Claude.

---

## 🖥️ MCP Servers Explained

MCP Servers provide access to **data or functionality** implemented by outside services.  
They act as **specialized interfaces** exposing **tools, prompts, and resources** in a standardized way.

![MCP Architecture Diagram](images/005.png)

**Example (GitHub MCP Server):**

- Contains tools like `get_repos()`  
- Connects directly to **GitHub’s API**  
- Your server communicates with the MCP Server  
- The MCP server handles all the GitHub-specific details

---

## ❓ Common Questions

### 👩‍💻 Who authors MCP Servers?

Anyone can create an MCP server.  

- Sometimes **service providers** (e.g., AWS, GitHub) publish official MCP implementations.  
- Other times, the community creates them.

---

### 🔗 How is this different from calling APIs directly?

- **Calling APIs directly:** You must define tool schemas and handle integration.  
- **Using MCP:** Tool schemas & functions are **already defined** for you.  

👉 MCP saves you the **implementation work**.

---

### 🔧 Isn’t MCP just tool use?

Not exactly.  

- **Tool use** → How Claude actually calls tools.  
- **MCP Servers** → Provide **predefined tool schemas & implementations**.  

The key difference is **who does the work**:  

- Without MCP → You write and maintain all integrations.  
- With MCP → The MCP server authors already implemented them.

✅ Benefit: You focus on your app logic, not integration complexity.

---

# MCP Server Primitives

Now that we've built our MCP server, let's review the three core server primitives and understand when to use each one.  
The key insight is that **each primitive is controlled by a different part of your application stack.**

![MCP Server Primitives](images/mcp-server-primitives.png)

---

## 🛠️ Tools: Model-Controlled

- **Controlled by:** Claude (the AI model)  
- **When used:** The AI decides when to call these functions, and the results are used directly to accomplish tasks.  

✅ Tools are perfect for giving Claude **additional capabilities** it can use autonomously.  

**Example:**  
When you ask Claude to *“calculate the square root of 3 using JavaScript”*, it decides to use a JavaScript execution tool to run the calculation.

---

## 📦 Resources: App-Controlled

- **Controlled by:** Your application code  
- **When used:** The app decides when to fetch resource data and how to use it (typically for UI elements or adding context).  

✅ Resources are great for integrating data into your app.  

**Examples from our project:**  

- Fetching data to populate autocomplete options in the UI  
- Retrieving content to augment prompts with additional context  

Think of the **“Add from Google Drive”** feature in Claude’s interface:  
The app decides which documents to show and injects their content into the chat context.

---

## 📝 Prompts: User-Controlled

- **Controlled by:** End users  
- **When used:** Triggered by user actions like button clicks, menu selections, or slash commands.  

✅ Prompts are ideal for **predefined workflows** users can start on demand.  

**Example:**  
In Claude’s interface, workflow buttons below the chat input are prompts — optimized workflows that users can run with one click.

---

## ⚖️ Choosing the Right Primitive

Here’s a quick decision guide:

- **Need to give Claude new capabilities?** → Use **Tools**  
- **Need to get data into your app for UI or context?** → Use **Resources**  
- **Want to create predefined workflows for users?** → Use **Prompts**  

---

You can see all three primitives in action in Claude’s official interface:

- **Prompts:** workflow buttons  
- **Resources:** Google Drive integration  
- **Tools:** executing code or performing calculations  

Each serves a different part of your application stack:  

- Tools → serve the **model**  
- Resources → serve your **app**  
- Prompts → serve your **users**
