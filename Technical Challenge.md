**ENTERMIND  /  ENGINEERING HIRING TECHNICAL ASSESSMENT** 

# **Technical Challenge** 

### **Inventory Reservation System** 

#### **AI tools are allowed and encouraged.** 

Use ChatGPT, Claude, Codex, Copilot, or similar tools if helpful. We care about how effectively you use AI while still understanding, validating, and owning the solution. 

## **Challenge** 

Build a small **Inventory Reservation System** that allows customers to view available products, reserve inventory, and manage their reservations. Administrators should be able to manage inventory and review reservations. 

The objective is to demonstrate how you approach a real engineering problem across the frontend, backend, database, and production concerns. 

## **Business Rules** 

- Inventory is limited. 

- Multiple users may attempt to reserve the same product at the same time. 

- A reservation may contain one or more products. 

- Pending reservations expire after 10 minutes if they are not completed. 

- Cancelling or expiring a reservation should make the inventory available again. 

- The system must never reserve more inventory than is actually available. 

- Repeated or interrupted requests should not leave the system in an incorrect state. 

- Administrators may adjust inventory, but existing valid reservations must remain consistent. 

- Customers should only be able to access and manage their own reservations. 

**How these rules are implemented is your decision.** 

## **Expected Application** 

Your solution should include: 

- A working frontend 

- A backend/API 

- A persistent database 

- Authentication with customer/admin roles 

- Appropriate validation and error handling 

- Automated tests for important behaviour 

- Clear local setup and run instructions 

You may choose any reasonable modern technology stack. The frontend does not need to be visually complex; we care more about correct behaviour, engineering decisions, maintainability, and completeness. 

**What will impress us:** strong product thinking and user flow, clear application architecture, scalability awareness, design thinking, and production readiness. 

Technical Challenge 

**ENTERMIND  /  ENGINEERING HIRING** 

## **Your App Should Answer These Questions** 

Include brief answers in your **README.md** . 

**1. How does your system keep inventory correct when multiple users reserve the same product concurrently?** 

**2. What happens when a request succeeds but the client does not receive the response and retries?** 

**3. How do you ensure a reservation containing multiple products does not end up partially completed?** 

**4. How does the system handle expired or cancelled reservations and make inventory available again?** 

**5. What failure scenarios did you consider, and how does the application recover from them?** 

**6. If the application suddenly had to support 100,000 concurrent users, where would you expect the first bottleneck or failure to appear? What would you change?** 

**7. What would you improve before considering this application production-ready?** 

**8. How did you use AI during the challenge?** 

   - Where did AI help? 

   - What AI-generated suggestions or code did you change or reject? 

   - Which important engineering decisions did you make yourself? 

## **Submission** 

Submit a **public GitHub repository** containing: 

- Application source code 

- Database schema/migrations 

- Automated tests 

- README.md with clear instructions to run the application locally 

Your README.md should also include: 

- A short architecture overview 

- Key assumptions and trade-offs 

- Answers to the questions above 

**We are not evaluating how much code you can generate.** We are evaluating your ability to understand the problem, make sound engineering decisions, connect the full stack, identify failure cases, and use AI effectively without depending on it blindly. 

Technical Challenge 

