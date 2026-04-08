What do you think I could do to contribute to this project with my limited skill set? It would be a large learning curve, but I am willing to learn. Also, stop using emojis and be thorough with explanation
 

Strategy & Steps:
Start with a problem (First half of 1st day)
Talk to judges, do research
Understand customers
Emotional pull or story tied to, RESONATES WITH PEOPLE
How do we solve it?
Not mapped to specific API 

Preperation 
Always come in with a plan beforehand 
Ideas, team, figure out tech stack
Dont write code beforehand, but you can practice implementing APIs and stuff
Make it clear who’s going to handle what
Give more complex tasks to more experienced people
Make list of what needs to get done 

Keep scope limited
Whats the most important aspect of your hackathon?
Know what your MVP needs  

Technical Complexity 
Computer vision, blockchain, cool acronyms
Not how many you use, but how well you use them
Go for showiness
USE AS MANY RESOURCES AS YOU CAN

Demo
Set aside at least 8 hours to polish demo, makes or breaks your project 
Doesnt cover boring pieces like user login 
Focus on one very impressive feature 
Interactive, visual, entertaining (can be any one of these, more = better)
This is why hardware hacks do so good because theyre more interactive 
2-3 minute pitch, so explain premise first (tell a story) then go right into meat. 
Include technical complexity AND story

Other points:
Devpost entry extremely important, thats what judges look at, make it clear youre ready to present 
Let people flock to your table 
Workflow:
1 Idea / problem brainstorming 
Attainable
Base feature
Input / output?

2 Frontend + backend mockups
Use v0

3 Database 
Shove everything from Supabase into LLM

4 APIs and Integration

5 Database integration & Debugging


Example: Galileo -> Next.js + Supabase in cursor -> hook up an AI API -> Polish with Tailwind -> present with Gamma (Don't have to follow exactly)

Piece-by-piece breakdown:

Galileo: 
This is usually an AI design tool.
You give it a prompt like: “build a dashboard for tracking fitness goals”
It generates:
UI mockups
Sometimes actual frontend code
-Lets you skip manual design and get a clean UI instantly 
-What’s the point in starting with a mockup?

Next.js + Supabase in Cursor:
This is the core development stack.
Next.js
React framework for building web apps
Handles:
Pages / routing
Frontend logic
Server-side rendering (if needed)
Supabase
Backend-as-a-service (like Firebase)
Handles:
Database (PostgreSQL)
Authentication (login/signup)
Storage (files, images)
Cursor
AI-powered code editor (like VS Code but smarter)
Helps you:
Generate code
Debug quickly
Refactor using AI
API Hookup
Usually something like:
OpenAI API
Claude API
Other LLM services
This adds:
Chat features
AI recommendations
Automation logic

Tailwind CSS
A styling framework
Instead of writing CSS, you use utility classes like:
flex, p-4, bg-blue-500

Tools Overview
Planning:
Notion: Documentation and Planning
Create pitch decks and feature specs

Code:
Cursor 

Windsurf

Supabase
UI:

Figma: UI and design prototyping (free templates on Locofy)

Github Copilot

APIs
	OpenAI / replicate
AI Tools:

You build the structure yourself (pages , API routes, etc)
Use AI for each task within those structures 


Examples

Members:
Kamsi
Andrew
Jacob

Repo:
https://github.com/JacobHarris-Dev/TradeWise-AI


Helpful Sheet I have created:
Strategy Sheet

Instructions:
https://drive.google.com/file/d/1YgCzeGuoU_rTSO4lY5hbtGaCfp3QAtce/view?usp=drivesdk

Info session:
https://docs.google.com/presentation/d/1BB995wPANE2ekMB2sEOezDoiOruUpS3m1K8tX-OW5r0/edit?usp=drivesdk

Competition Choice:
Theme Option 4 – Next-Gen Payments, Trading & Fraud Defense
2. Paper-Trading Strategy Simulator Create a tool where users can code or choose simple trading strategies and backtest them on historical data, with performance and risk metrics.

The Problem:
Trading can be very inaccessible to people with tighter budgets or lack of experience, as they might not want to risk their money on something they don’t understand. TradWise wants to break that barrier and assist people into the trading world by giving them a simulated environment to learn and grow in without the threat of financial loss. 

Core idea 
AI-Powered Paper Trading Simulator
This project is a web-based paper trading platform that allows users to simulate stock trading using virtual money while receiving AI-driven insights.
The system combines machine learning and large language models to both generate trading signals and explain them in a human-readable way.
How It Works
Market data is fetched from a financial API.
A machine learning model analyzes technical indicators such as moving averages and RSI.
The model predicts whether a stock is likely to go up or down (BUY/SELL signal).
A large language model (via Ollama) generates a natural language explanation for the prediction.
Users can execute simulated trades and track their portfolio performance over time.
Key Features
Real-time or near real-time stock data
Machine learning-based trade predictions
AI-generated explanations for each trade
Paper trading with virtual balance
Portfolio tracking and profit/loss visualization
3 Simulate stocks to choose from
Why This Matters
This platform helps beginner traders learn and experiment with trading strategies without financial risk, while also making AI-driven decisions more transparent and understandable.
Tech Stack
Frontend
Next.js (React framework for UI and API routes)
Tailwind CSS (styling)
Charting Library (TradingView widget or Chart.js)
Backend
Next.js API routes (lightweight backend)
Node.js (server runtime)
Supabase (historical data)
Machine Learning (AI Core)
Python
pandas (data processing and feature engineering)
scikit-learn (model training and predictions)
LLM Integration
Ollama (local LLM runtime)
LLaMA 3 or Mistral (for generating explanations)
Data Sources
Alpha Vantage or IEX Cloud (stock market data APIs)
Deployment
Vercel (frontend + backend hosting)
Optional: Render or Railway (Python microservice)
Communication
REST API (JSON responses between frontend and backend)

Demo:
User test trading strategy, gets an AI signal, understands WHY (empahasis on education for smart trading strategies -> score + LLM description) 

Phases:
I figured we could work in waves since this isnt like a traditional hackathon sprint (and we have classes RIP). Each phase should take about 3ish hours and we can honestly thug it out in Sci Li if you want - Jacob 




Phase 1: Scaffold app

Jacob: Backend / Data + frontend 
Establish API Routes
Use Supabase for database
Set up mock model, get it running (API returns dummy data)
I decided not to vibecode whole site but to vibecode within components
Create app with Next.js
Setup pages for dashboard, trade, and portfolio



Andrew: AI / ML 
Prepare moving average logic 
Phase 2: Get data actually working
Need to get historical data on Supabase 
Display on frontend

Phase 3: Build main feature for the calculations and scoring

Signal generation
Visualtion
API Connection
Phase 4: AI explanation Layer
Focus on more user oriented stuff
-call LLM and display stuff to explain trade

Phase 5: Paper Trading System
By, sell
Portfolio
Fake balance, gamify it
Phase 6: Polish 
Tailwind CSS
Clean dashboard, dont let it look like AI slop
Make sure its interactive


Phase 7: Presentation + demo
Create whole presentation and pitch


What NOT To do:
Dont commit .env (stores API Keys and stuff)
Instead, use gitignore
We will communicate information through discord, make sure to include on your branch but dont push it

Dont commit node modules
Way too big
Dont commit venv
Same with Node modules


