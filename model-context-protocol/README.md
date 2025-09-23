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

# MCP Flow

![MCP Flow](images/007.png)

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

---

# Model Context Protocol: Advanced Topics

# *Core MCP features*

## 1. Sampling

Sampling allows a server to access a language model like Claude through a connected MCP client. Instead of the server directly calling Claude, it asks the client to make the call on its behalf. This shifts the responsibility and cost of text generation from the server to the client.

![sampling01](images/sampling-001.png)
![sampling02](images/sampling-002.png)
![sampling03](images/sampling-003.png)

---

## 2. Log and progress notifications
Logging and progress notifications are simple to implement but make a huge difference in user experience when working with MCP servers. They help users understand what's happening during long-running operations instead of wondering if something has broken.

When Claude calls a tool that takes time to complete - like researching a topic or processing data - users typically see nothing until the operation finishes. This can be frustrating because they don't know if the tool is working or has stalled.

With logging and progress notifications enabled, users get real-time feedback showing exactly what's happening behind the scenes. They can see progress bars, status messages, and detailed logs as the operation runs.

![notification01](images/notification-001.png)
![notification02](images/notification-002.png)
---

## 3. Roots

Roots are a way to grant MCP servers access to specific files and folders on your local machine. Think of them as a permission system that says "Hey, MCP server, you can access these files" - but they do much more than just grant permission.

![roots01](images/roots-001.png)
Always need to pass the proper path of the resource for LLM to recognize it
![roots02](images/roots-002.png)

To Solve this problem using Roots
![roots03](images/roots-003.png)

![roots04](images/roots-004.png)

---

# *Transports and communication*

## 1. JSON message types
MCP (Model Context Protocol) uses JSON messages to handle communication between clients and servers. Understanding these message types is crucial for working with MCP, especially when dealing with different transport methods like the streamable HTTP transport.
![alt text](images/transports-001.png)
![alt text](images/transports-002.png)
MCP Schema - https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/schema/2025-06-18/schema.ts
![alt text](images/transports-003.png)
![alt text](images/transports-004.png)

## 2. The STDIO transport
MCP clients and servers communicate by exchanging JSON messages, but how do these messages actually get transmitted? The communication channel used is called a transport, and there are several ways to implement this - from HTTP requests to WebSockets to even writing JSON on a postcard (though that last one isn't recommended for production use).
![alt text](images/transports-005.png)
![alt text](images/transports-006.png)
![alt text](images/transports-007.png)
![alt text](images/transports-008.png)

## 3. The StreamableHTTP transport

The streamable HTTP transport enables MCP clients to connect to remotely hosted servers over HTTP connections. Unlike the standard I/O transport that requires both client and server on the same machine, this transport opens up possibilities for public MCP servers that anyone can access.

![alt text](images/transports-009.png)
![alt text](images/transports-010.png)
![alt text](images/transports-011.png)
![alt text](images/transports-012.png)
![alt text](images/transports-013.png)
![alt text](images/transports-014.png)
![alt text](images/transports-015.png)
---
- Solving Issues by using SSE (Server Sent Events) connection from server to client

![alt text](images/transports-016.png)
![alt text](images/transports-017.png)
---
- State and the StreamableHTTP transport

![alt text](images/transports-018.png) ![alt text](images/transports-019.png)
![alt text](images/transports-020.png)
![alt text](images/transports-021.png)

---

### When to Use These Flags

#### Use stateless HTTP when

- You need horizontal scaling with load balancers
- You don't need server-to-client communication
- Your tools don't require AI model sampling
- You want to minimize connection overhead

#### Use JSON response when

- You don't need streaming responses
- You prefer simpler, non-streaming HTTP responses
- You're integrating with systems that expect plain JSON

### Development vs Production

If you're developing locally with standard I/O transport but planning to deploy with HTTP transport, test with the same transport you'll use in production. The behavior differences between stateful and stateless modes can be significant, and it's better to catch any issues during development rather than after deployment.

These flags fundamentally change how your MCP server operates, so choose them based on your specific scaling and functionality requirements.

---

## Some Ref Links

- https://modelcontextprotocol.io/
- https://github.com/modelcontextprotocol
- https://modelcontextprotocol.io/community/communication
- https://github.com/orgs/modelcontextprotocol/discussions
