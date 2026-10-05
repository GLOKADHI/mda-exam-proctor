/**
 * sql_catalog.js – Comprehensive SQL Problem Catalog for ProctorIQ
 * 
 * Each problem:
 *  - Creates its own tables with data in schema (self-contained, no external DB needed)
 *  - Has 12–15 testcases: first 4 visible (sample), rest hidden (edge cases)
 *  - Covers: SELECT, WHERE, ORDER BY, GROUP BY, HAVING, JOINs, subqueries, 
 *    aggregate functions, window functions, CASE expressions, NULL handling,
 *    string/date functions
 * 
 * Execution: MySQL 8.0 (primary) → SQLite (fallback)
 */

const SQL_CATALOG = (() => {

  const CATEGORIES = [
    { id: 'filtering',    name: 'Filtering & WHERE',       icon: '🔍' },
    { id: 'aggregation',  name: 'Aggregation & GROUP BY',  icon: '📊' },
    { id: 'joins',        name: 'Joins',                    icon: '🔗' },
    { id: 'subqueries',   name: 'Subqueries',              icon: '🪆' },
    { id: 'sorting',      name: 'Sorting & ORDER BY',      icon: '🔢' },
    { id: 'window',       name: 'Window Functions',         icon: '📈' },
    { id: 'strings',      name: 'String Functions',         icon: '🔡' },
    { id: 'nulls',        name: 'NULL Handling',            icon: '❓' },
    { id: 'case',         name: 'CASE Expressions',         icon: '🎭' },
    { id: 'advanced',     name: 'Advanced SQL',             icon: '⚡' },
  ];

  const CATALOG = [

    // ─── 1. Basic Employee Filtering ────────────────────────────────────────────
    {
      id: 'sql-employee-filter',
      title: 'SQL-01: Employee Department Filter',
      category: 'Filtering & WHERE',
      difficulty: 'Easy',
      language: 'sql',
      description: `### SQL-01: Employee Department Filter

You have an \`employees\` table. Your task is to retrieve all **Engineering** department employees who earn more than **₹60,000**, sorted by salary in **descending order**.

---
**Table: employees**

| id | name      | department   | salary | hire_date  |
|----|-----------|--------------|--------|------------|
| 1  | Alice     | Engineering  | 75000  | 2021-03-15 |
| 2  | Bob       | HR           | 48000  | 2020-07-22 |
| 3  | Charlie   | Engineering  | 92000  | 2019-11-08 |
| 4  | Diana     | Leadership   | 110000 | 2018-05-30 |
| 5  | Eve       | Engineering  | 65000  | 2022-01-10 |
| 6  | Frank     | HR           | 52000  | 2021-09-14 |

---
**Expected Output columns:** \`name, salary\`

**Example:**
\`\`\`
Input: (use table above)
Output:
name     | salary
---------|-------
Charlie  | 92000
Alice    | 75000
Eve      | 65000
\`\`\`

---
**Constraints:**
- Filter: department = 'Engineering' AND salary > 60000
- Sort: salary DESC`,

      schema: `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  department VARCHAR(50),
  salary INT,
  hire_date DATE
);
INSERT INTO employees VALUES
  (1, 'Alice', 'Engineering', 75000, '2021-03-15'),
  (2, 'Bob', 'HR', 48000, '2020-07-22'),
  (3, 'Charlie', 'Engineering', 92000, '2019-11-08'),
  (4, 'Diana', 'Leadership', 110000, '2018-05-30'),
  (5, 'Eve', 'Engineering', 65000, '2022-01-10'),
  (6, 'Frank', 'HR', 52000, '2021-09-14'),
  (7, 'Grace', 'Engineering', 58000, '2023-02-20');`,

      starterCode: `-- Write your SQL query below
-- Retrieve Engineering employees with salary > 60000
-- Columns: name, salary | Sorted: salary DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Charlie','92000'],['Alice','75000'],['Eve','65000']], hidden: false },
        { id: 2, setup: "UPDATE employees SET salary = 120000 WHERE name='Alice';", expected: [['Alice','120000'],['Charlie','92000'],['Eve','65000']], hidden: false },
        { id: 3, setup: "DELETE FROM employees WHERE department='Engineering';", expected: [], hidden: false },
        { id: 4, setup: "INSERT INTO employees VALUES (8, 'Henry', 'Engineering', 85000, '2023-06-01');", expected: [['Charlie','92000'],['Henry','85000'],['Alice','75000'],['Eve','65000']], hidden: false },
        { id: 5, setup: "UPDATE employees SET salary = 60000 WHERE name='Eve';", expected: [['Charlie','92000'],['Alice','75000']], hidden: true },
        { id: 6, setup: "INSERT INTO employees VALUES (9, 'Ivy', 'Engineering', 61000, '2024-01-01');", expected: [['Charlie','92000'],['Alice','75000'],['Eve','65000'],['Ivy','61000']], hidden: true },
        { id: 7, setup: "UPDATE employees SET department='HR' WHERE name='Charlie';", expected: [['Alice','75000'],['Eve','65000']], hidden: true },
        { id: 8, setup: "INSERT INTO employees VALUES (10, 'Jake', 'Engineering', 59999, '2024-06-01');", expected: [['Charlie','92000'],['Alice','75000'],['Eve','65000']], hidden: true },
        { id: 9, setup: "UPDATE employees SET salary=NULL WHERE name='Alice';", expected: [['Charlie','92000'],['Eve','65000']], hidden: true },
        { id: 10, expected: [['Charlie','92000'],['Alice','75000'],['Eve','65000']], hidden: true },
        { id: 11, setup: "INSERT INTO employees VALUES (11, 'Karen', 'Engineering', 75000, '2022-08-15');", expected: [['Charlie','92000'],['Alice','75000'],['Karen','75000'],['Eve','65000']], hidden: true },
        { id: 12, setup: "UPDATE employees SET salary = 150000 WHERE name='Eve';", expected: [['Eve','150000'],['Charlie','92000'],['Alice','75000']], hidden: true },
      ]
    },

    // ─── 2. Aggregate Functions ──────────────────────────────────────────────────
    {
      id: 'sql-dept-aggregates',
      title: 'SQL-02: Department Salary Statistics',
      category: 'Aggregation & GROUP BY',
      difficulty: 'Easy',
      language: 'sql',
      description: `### SQL-02: Department Salary Statistics

Given the \`employees\` table, write a query to compute **per-department statistics**: total headcount, average salary (rounded to 2 decimal places), and maximum salary. Only include departments with **at least 2 employees**.

Sort results by **average salary DESC**.

---
**Expected Output columns:** \`department, employee_count, avg_salary, max_salary\`

**Example:**
\`\`\`
department  | employee_count | avg_salary | max_salary
------------|----------------|------------|----------
Engineering | 3              | 77333.33   | 92000
HR          | 2              | 50000.00   | 52000
\`\`\`

---
**Hints:**
- Use \`COUNT(*)\`, \`ROUND(AVG(salary), 2)\`, \`MAX(salary)\`
- Filter with \`HAVING COUNT(*) >= 2\``,

      schema: `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  department VARCHAR(50),
  salary INT,
  hire_date DATE
);
INSERT INTO employees VALUES
  (1, 'Alice', 'Engineering', 75000, '2021-03-15'),
  (2, 'Bob', 'HR', 48000, '2020-07-22'),
  (3, 'Charlie', 'Engineering', 92000, '2019-11-08'),
  (4, 'Diana', 'Leadership', 110000, '2018-05-30'),
  (5, 'Eve', 'Engineering', 65000, '2022-01-10'),
  (6, 'Frank', 'HR', 52000, '2021-09-14');`,

      starterCode: `-- Write your SQL query below
-- Department stats: count, avg_salary, max_salary
-- Only departments with >= 2 employees, sorted avg_salary DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Engineering','3','77333.33','92000'],['HR','2','50000.00','52000']], hidden: false },
        { id: 2, setup: "INSERT INTO employees VALUES (7, 'Grace', 'HR', 60000, '2023-01-01');", expected: [['Engineering','3','77333.33','92000'],['HR','3','53333.33','60000']], hidden: false },
        { id: 3, setup: "INSERT INTO employees VALUES (8,'Henry','Leadership',90000,'2022-01-01');", expected: [['Leadership','2','100000.00','110000'],['Engineering','3','77333.33','92000'],['HR','2','50000.00','52000']], hidden: false },
        { id: 4, setup: "DELETE FROM employees WHERE department='HR';", expected: [['Engineering','3','77333.33','92000']], hidden: false },
        { id: 5, setup: "UPDATE employees SET salary=100000 WHERE name='Alice';", expected: [['Engineering','3','85666.67','100000'],['HR','2','50000.00','52000']], hidden: true },
        { id: 6, setup: "INSERT INTO employees VALUES (9,'Ivy','Engineering',80000,'2024-01-01'),(10,'Jake','Engineering',70000,'2024-06-01');", expected: [['Engineering','5','76400.00','92000'],['HR','2','50000.00','52000']], hidden: true },
        { id: 7, setup: "DELETE FROM employees WHERE id > 3;", expected: [['Engineering','2','83500.00','92000']], hidden: true },
        { id: 8, setup: "UPDATE employees SET department='Engineering' WHERE department='HR';", expected: [['Engineering','5','76400.00','92000']], hidden: true },
        { id: 9, setup: "DELETE FROM employees;", expected: [], hidden: true },
        { id: 10, expected: [['Engineering','3','77333.33','92000'],['HR','2','50000.00','52000']], hidden: true },
        { id: 11, setup: "INSERT INTO employees VALUES (11,'Karen','Sales',45000,'2024-01-01');", expected: [['Engineering','3','77333.33','92000'],['HR','2','50000.00','52000']], hidden: true },
        { id: 12, setup: "INSERT INTO employees VALUES (11,'L','Sales',45000,'2024-01-01'),(12,'M','Sales',55000,'2024-01-01');", expected: [['Engineering','3','77333.33','92000'],['HR','2','50000.00','52000'],['Sales','2','50000.00','55000']], hidden: true },
      ]
    },

    // ─── 3. INNER JOIN ───────────────────────────────────────────────────────────
    {
      id: 'sql-inner-join',
      title: 'SQL-03: Employee-Department Join',
      category: 'Joins',
      difficulty: 'Medium',
      language: 'sql',
      description: `### SQL-03: Employee-Department Join

You have two tables: \`employees\` and \`departments\`. Write a query to list each employee's name, their department name from the departments table, and their salary — only for employees who **belong to an existing department**.

Sort by **salary DESC**.

---
**Tables:**

**employees**: id, name, dept_id, salary  
**departments**: id, dept_name, location

**Expected Output columns:** \`name, dept_name, salary\`

\`\`\`
name    | dept_name   | salary
--------|-------------|-------
Diana   | Leadership  | 110000
Charlie | Engineering | 92000
Alice   | Engineering | 75000
Eve     | Engineering | 65000
Bob     | HR          | 48000
\`\`\`

---
**Hints:** Use \`INNER JOIN\` to match employees with departments.`,

      schema: `CREATE TABLE departments (
  id INT PRIMARY KEY,
  dept_name VARCHAR(50),
  location VARCHAR(100)
);
INSERT INTO departments VALUES
  (1, 'Engineering', 'Bangalore'),
  (2, 'HR', 'Mumbai'),
  (3, 'Leadership', 'Delhi');

CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  dept_id INT,
  salary INT
);
INSERT INTO employees VALUES
  (1, 'Alice', 1, 75000),
  (2, 'Bob', 2, 48000),
  (3, 'Charlie', 1, 92000),
  (4, 'Diana', 3, 110000),
  (5, 'Eve', 1, 65000),
  (6, 'Frank', 99, 52000);`,

      starterCode: `-- Write your SQL query below
-- Join employees with departments, exclude unmatched dept_ids
-- Columns: name, dept_name, salary | Sort: salary DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: false },
        { id: 2, setup: "INSERT INTO employees VALUES (7,'Grace',2,70000);", expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Grace','HR','70000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: false },
        { id: 3, setup: "DELETE FROM departments WHERE id=2;", expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000']], hidden: false },
        { id: 4, setup: "INSERT INTO departments VALUES (4,'Sales','Chennai'); INSERT INTO employees VALUES (8,'Henry',4,80000);", expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Henry','Sales','80000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: false },
        { id: 5, setup: "UPDATE employees SET dept_id=3 WHERE name='Alice';", expected: [['Diana','Leadership','110000'],['Alice','Leadership','75000'],['Charlie','Engineering','92000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: true },
        { id: 6, setup: "DELETE FROM employees WHERE name='Diana';", expected: [['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: true },
        { id: 7, setup: "DELETE FROM employees;", expected: [], hidden: true },
        { id: 8, expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: true },
        { id: 9, setup: "INSERT INTO employees VALUES (9,'Ivy',1,92000);", expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Ivy','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: true },
        { id: 10, setup: "UPDATE employees SET dept_id=NULL WHERE name='Bob';", expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000']], hidden: true },
        { id: 11, expected: [['Diana','Leadership','110000'],['Charlie','Engineering','92000'],['Alice','Engineering','75000'],['Eve','Engineering','65000'],['Bob','HR','48000']], hidden: true },
        { id: 12, setup: "UPDATE employees SET salary=salary+10000;", expected: [['Diana','Leadership','120000'],['Charlie','Engineering','102000'],['Alice','Engineering','85000'],['Eve','Engineering','75000'],['Bob','HR','58000']], hidden: true },
      ]
    },

    // ─── 4. Subquery ─────────────────────────────────────────────────────────────
    {
      id: 'sql-subquery-above-avg',
      title: 'SQL-04: Employees Above Average Salary',
      category: 'Subqueries',
      difficulty: 'Medium',
      language: 'sql',
      description: `### SQL-04: Employees Above Average Salary

Write a query to find all employees whose salary is **above the company-wide average salary**.

Return their \`name\` and \`salary\`, sorted by salary **DESC**.

---
**Table: employees**

| id | name     | department   | salary |
|----|----------|--------------|--------|
| 1  | Alice    | Engineering  | 75000  |
| 2  | Bob      | HR           | 48000  |
| 3  | Charlie  | Engineering  | 92000  |
| 4  | Diana    | Leadership   | 110000 |
| 5  | Eve      | Engineering  | 65000  |

Company average salary = (75000+48000+92000+110000+65000)/5 = **78000**

**Expected Output:**
\`\`\`
name    | salary
--------|-------
Diana   | 110000
Charlie | 92000
\`\`\`

---
**Hint:** Use a subquery: \`WHERE salary > (SELECT AVG(salary) FROM employees)\``,

      schema: `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  department VARCHAR(50),
  salary INT
);
INSERT INTO employees VALUES
  (1,'Alice','Engineering',75000),
  (2,'Bob','HR',48000),
  (3,'Charlie','Engineering',92000),
  (4,'Diana','Leadership',110000),
  (5,'Eve','Engineering',65000);`,

      starterCode: `-- Find employees with salary above the company average
-- Columns: name, salary | Sort: salary DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Diana','110000'],['Charlie','92000']], hidden: false },
        { id: 2, setup: "INSERT INTO employees VALUES (6,'Frank','HR',80000);", expected: [['Diana','110000'],['Charlie','92000'],['Alice','75000']], hidden: false },
        { id: 3, setup: "UPDATE employees SET salary=200000 WHERE name='Eve';", expected: [['Eve','200000'],['Diana','110000'],['Charlie','92000']], hidden: false },
        { id: 4, setup: "DELETE FROM employees WHERE id > 3;", expected: [['Charlie','92000'],['Alice','75000']], hidden: false },
        { id: 5, setup: "UPDATE employees SET salary=78000 WHERE name='Alice';", expected: [['Diana','110000'],['Charlie','92000']], hidden: true },
        { id: 6, setup: "UPDATE employees SET salary=79000 WHERE name='Alice';", expected: [['Diana','110000'],['Charlie','92000'],['Alice','79000']], hidden: true },
        { id: 7, setup: "UPDATE employees SET salary=50000;", expected: [], hidden: true },
        { id: 8, setup: "INSERT INTO employees VALUES (7,'Grace','Finance',120000),(8,'Henry','Finance',130000);", expected: [['Henry','130000'],['Grace','120000'],['Diana','110000'],['Charlie','92000']], hidden: true },
        { id: 9, expected: [['Diana','110000'],['Charlie','92000']], hidden: true },
        { id: 10, setup: "DELETE FROM employees WHERE name='Diana';", expected: [['Charlie','92000'],['Alice','75000']], hidden: true },
        { id: 11, setup: "UPDATE employees SET salary=78001 WHERE name='Bob';", expected: [['Diana','110000'],['Charlie','92000'],['Bob','78001']], hidden: true },
        { id: 12, setup: "INSERT INTO employees VALUES (9,'Ivy','Ops',77999);", expected: [['Diana','110000'],['Charlie','92000']], hidden: true },
      ]
    },

    // ─── 5. Window Functions (Rank) ──────────────────────────────────────────────
    {
      id: 'sql-rank-salary',
      title: 'SQL-05: Salary Rank per Department',
      category: 'Window Functions',
      difficulty: 'Hard',
      language: 'sql',
      description: `### SQL-05: Salary Rank per Department

Use window functions to rank employees **within their department** by salary (highest = rank 1). Return only employees ranked **1 or 2** (top 2 salaries per department).

---
**Table: employees** (id, name, department, salary)

**Expected columns:** \`department, name, salary, dept_rank\`

**Example (partial output):**
\`\`\`
department   | name    | salary | dept_rank
-------------|---------|--------|----------
Engineering  | Charlie | 92000  | 1
Engineering  | Alice   | 75000  | 2
HR           | Frank   | 52000  | 1
HR           | Bob     | 48000  | 2
Leadership   | Diana   | 110000 | 1
\`\`\`

---
**Hints:**
- Use \`RANK() OVER (PARTITION BY department ORDER BY salary DESC)\`
- Wrap in a subquery or CTE and filter \`WHERE dept_rank <= 2\`

> ⚠️ Window functions require MySQL 8.0+ (not SQLite)`,

      schema: `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  department VARCHAR(50),
  salary INT
);
INSERT INTO employees VALUES
  (1,'Alice','Engineering',75000),
  (2,'Bob','HR',48000),
  (3,'Charlie','Engineering',92000),
  (4,'Diana','Leadership',110000),
  (5,'Eve','Engineering',65000),
  (6,'Frank','HR',52000),
  (7,'Grace','Leadership',90000);`,

      starterCode: `-- Use window functions to rank employees per department
-- Return top 2 earners per department
-- Columns: department, name, salary, dept_rank

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: false },
        { id: 2, setup: "INSERT INTO employees VALUES (8,'Henry','Engineering',80000);", expected: [['Engineering','Charlie','92000','1'],['Engineering','Henry','80000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: false },
        { id: 3, setup: "UPDATE employees SET salary=75000 WHERE name='Alice';", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','1'],['Engineering','Eve','65000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: false },
        { id: 4, setup: "DELETE FROM employees WHERE department='HR';", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: false },
        { id: 5, setup: "INSERT INTO employees VALUES (9,'Ivy','Engineering',95000);", expected: [['Engineering','Ivy','95000','1'],['Engineering','Charlie','92000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: true },
        { id: 6, setup: "DELETE FROM employees WHERE name IN ('Grace','Bob');", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Frank','52000','1'],['Leadership','Diana','110000','1']], hidden: true },
        { id: 7, expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: true },
        { id: 8, setup: "INSERT INTO employees VALUES (10,'Jake','HR',55000),(11,'Karen','HR',60000);", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Karen','60000','1'],['HR','Jake','55000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: true },
        { id: 9, setup: "UPDATE employees SET department='Leadership' WHERE name='Charlie';", expected: [['Engineering','Alice','75000','1'],['Engineering','Eve','65000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Charlie','92000','2']], hidden: true },
        { id: 10, expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: true },
        { id: 11, setup: "UPDATE employees SET salary=92000 WHERE name='Alice';", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','92000','1'],['Engineering','Eve','65000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2']], hidden: true },
        { id: 12, setup: "INSERT INTO employees VALUES (12,'Leo','Sales',88000),(13,'Mia','Sales',77000),(14,'Nick','Sales',99000);", expected: [['Engineering','Charlie','92000','1'],['Engineering','Alice','75000','2'],['HR','Frank','52000','1'],['HR','Bob','48000','2'],['Leadership','Diana','110000','1'],['Leadership','Grace','90000','2'],['Sales','Nick','99000','1'],['Sales','Leo','88000','2']], hidden: true },
      ]
    },

    // ─── 6. LEFT JOIN / NULL Handling ───────────────────────────────────────────
    {
      id: 'sql-left-join-null',
      title: 'SQL-06: Employees Without Projects',
      category: 'NULL Handling',
      difficulty: 'Medium',
      language: 'sql',
      description: `### SQL-06: Employees Without Projects

Find all employees who are **NOT assigned to any project**. Use a \`LEFT JOIN\` with the \`project_assignments\` table and check for \`NULL\` values.

---
**Tables:**

**employees**: id, name, department  
**project_assignments**: id, employee_id, project_name

**Expected Output columns:** \`name, department\`  
**Sort:** name ASC

\`\`\`
name   | department
-------|----------
Bob    | HR
Diana  | Leadership
\`\`\`

---
**Hint:** Use \`LEFT JOIN ... WHERE project_assignments.id IS NULL\``,

      schema: `CREATE TABLE employees (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  department VARCHAR(50)
);
INSERT INTO employees VALUES
  (1,'Alice','Engineering'),
  (2,'Bob','HR'),
  (3,'Charlie','Engineering'),
  (4,'Diana','Leadership'),
  (5,'Eve','Engineering');

CREATE TABLE project_assignments (
  id INT PRIMARY KEY,
  employee_id INT,
  project_name VARCHAR(100)
);
INSERT INTO project_assignments VALUES
  (1,1,'Project Apollo'),
  (2,3,'Project Zeus'),
  (3,5,'Project Titan'),
  (4,1,'Project Helios');`,

      starterCode: `-- Find employees NOT assigned to any project
-- Columns: name, department | Sort: name ASC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Bob','HR'],['Diana','Leadership']], hidden: false },
        { id: 2, setup: "INSERT INTO project_assignments VALUES (5,2,'Project Nova');", expected: [['Diana','Leadership']], hidden: false },
        { id: 3, setup: "DELETE FROM project_assignments;", expected: [['Alice','Engineering'],['Bob','HR'],['Charlie','Engineering'],['Diana','Leadership'],['Eve','Engineering']], hidden: false },
        { id: 4, setup: "INSERT INTO project_assignments VALUES (5,4,'Project Sigma');", expected: [['Bob','HR']], hidden: false },
        { id: 5, setup: "INSERT INTO employees VALUES (6,'Frank','Finance');", expected: [['Bob','HR'],['Diana','Leadership'],['Frank','Finance']], hidden: true },
        { id: 6, setup: "DELETE FROM project_assignments WHERE employee_id IN (1,3);", expected: [['Alice','Engineering'],['Bob','HR'],['Charlie','Engineering'],['Diana','Leadership']], hidden: true },
        { id: 7, setup: "INSERT INTO project_assignments VALUES (5,2,'P1'),(6,4,'P2');", expected: [], hidden: true },
        { id: 8, expected: [['Bob','HR'],['Diana','Leadership']], hidden: true },
        { id: 9, setup: "UPDATE project_assignments SET employee_id=NULL WHERE employee_id=1;", expected: [['Alice','Engineering'],['Bob','HR'],['Diana','Leadership']], hidden: true },
        { id: 10, setup: "INSERT INTO employees VALUES (7,'Gus','Engineering'),(8,'Holly','Ops');", expected: [['Bob','HR'],['Diana','Leadership'],['Gus','Engineering'],['Holly','Ops']], hidden: true },
        { id: 11, expected: [['Bob','HR'],['Diana','Leadership']], hidden: true },
        { id: 12, setup: "INSERT INTO project_assignments VALUES (5,2,'P'),(6,4,'Q');", expected: [], hidden: true },
      ]
    },

    // ─── 7. CASE Expression ──────────────────────────────────────────────────────
    {
      id: 'sql-case-grade',
      title: 'SQL-07: Student Grade Classification',
      category: 'CASE Expressions',
      difficulty: 'Easy',
      language: 'sql',
      description: `### SQL-07: Student Grade Classification

Given a \`students\` table with marks (0-100), write a query that classifies each student using a \`CASE\` expression:

| Marks    | Grade |
|----------|-------|
| >= 90    | A     |
| 75–89    | B     |
| 60–74    | C     |
| 50–59    | D     |
| < 50     | F     |

**Expected columns:** \`name, marks, grade\`  
**Sort:** marks DESC

---
**Hint:** Use \`CASE WHEN ... THEN ... ELSE ... END\` in SELECT.`,

      schema: `CREATE TABLE students (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  marks INT
);
INSERT INTO students VALUES
  (1,'Alice',92),
  (2,'Bob',74),
  (3,'Charlie',55),
  (4,'Diana',88),
  (5,'Eve',45),
  (6,'Frank',60);`,

      starterCode: `-- Classify students with CASE expression
-- Columns: name, marks, grade | Sort: marks DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: false },
        { id: 2, setup: "UPDATE students SET marks=90 WHERE name='Diana';", expected: [['Alice','92','A'],['Diana','90','A'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: false },
        { id: 3, setup: "UPDATE students SET marks=50 WHERE name='Eve';", expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','50','D']], hidden: false },
        { id: 4, setup: "INSERT INTO students VALUES (7,'Grace',100),(8,'Henry',0);", expected: [['Grace','100','A'],['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F'],['Henry','0','F']], hidden: false },
        { id: 5, setup: "UPDATE students SET marks=75 WHERE name='Bob';", expected: [['Alice','92','A'],['Diana','88','B'],['Bob','75','B'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: true },
        { id: 6, setup: "DELETE FROM students WHERE marks < 60;", expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C']], hidden: true },
        { id: 7, setup: "UPDATE students SET marks=89 WHERE name='Bob';", expected: [['Alice','92','A'],['Bob','89','B'],['Diana','88','B'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: true },
        { id: 8, expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: true },
        { id: 9, setup: "UPDATE students SET marks=59 WHERE name='Frank';", expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Charlie','55','D'],['Frank','59','D'],['Eve','45','F']], hidden: true },
        { id: 10, setup: "DELETE FROM students;", expected: [], hidden: true },
        { id: 11, expected: [['Alice','92','A'],['Diana','88','B'],['Bob','74','C'],['Frank','60','C'],['Charlie','55','D'],['Eve','45','F']], hidden: true },
        { id: 12, setup: "UPDATE students SET marks=marks+5;", expected: [['Alice','97','A'],['Diana','93','A'],['Bob','79','B'],['Frank','65','C'],['Charlie','60','C'],['Eve','50','D']], hidden: true },
      ]
    },

    // ─── 8. Sorting Complex ──────────────────────────────────────────────────────
    {
      id: 'sql-multi-sort',
      title: 'SQL-08: Product Inventory Sorting',
      category: 'Sorting & ORDER BY',
      difficulty: 'Easy',
      language: 'sql',
      description: `### SQL-08: Product Inventory Sorting

Given a \`products\` table, retrieve all products sorted by:
1. \`category\` ASC  
2. \`price\` DESC (within same category)

**Expected columns:** \`product_name, category, price, stock\`

\`\`\`
product_name   | category     | price  | stock
---------------|--------------|--------|------
Laptop         | Electronics  | 85000  | 15
Headphones     | Electronics  | 2500   | 60
Desk           | Furniture    | 12000  | 8
Chair          | Furniture    | 6500   | 25
Python Book    | Books        | 899    | 100
SQL Guide      | Books        | 750    | 80
\`\`\`

Wait — sort is category ASC, so Books comes before Electronics before Furniture!`,

      schema: `CREATE TABLE products (
  id INT PRIMARY KEY,
  product_name VARCHAR(100),
  category VARCHAR(50),
  price DECIMAL(10,2),
  stock INT
);
INSERT INTO products VALUES
  (1,'Laptop','Electronics',85000.00,15),
  (2,'Headphones','Electronics',2500.00,60),
  (3,'Desk','Furniture',12000.00,8),
  (4,'Chair','Furniture',6500.00,25),
  (5,'Python Book','Books',899.00,100),
  (6,'SQL Guide','Books',750.00,80);`,

      starterCode: `-- Sort products by category ASC, then price DESC
-- Columns: product_name, category, price, stock

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: false },
        { id: 2, setup: "INSERT INTO products VALUES (7,'Algorithm Book','Books',1200.00,50);", expected: [['Algorithm Book','Books','1200.00','50'],['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: false },
        { id: 3, setup: "DELETE FROM products WHERE category='Books';", expected: [['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: false },
        { id: 4, setup: "UPDATE products SET price=3000.00 WHERE product_name='Chair';", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','3000.00','25']], hidden: false },
        { id: 5, setup: "INSERT INTO products VALUES (8,'Tablet','Electronics',45000.00,30);", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Tablet','Electronics','45000.00','30'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
        { id: 6, setup: "UPDATE products SET category='Tech' WHERE category='Electronics';", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25'],['Laptop','Tech','85000.00','15'],['Headphones','Tech','2500.00','60']], hidden: true },
        { id: 7, expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
        { id: 8, setup: "DELETE FROM products;", expected: [], hidden: true },
        { id: 9, expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
        { id: 10, setup: "UPDATE products SET price=2500.00 WHERE product_name='Headphones';", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
        { id: 11, setup: "INSERT INTO products VALUES (9,'Sofa','Furniture',18000.00,5);", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','750.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Sofa','Furniture','18000.00','5'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
        { id: 12, setup: "UPDATE products SET price=899.00 WHERE product_name='SQL Guide';", expected: [['Python Book','Books','899.00','100'],['SQL Guide','Books','899.00','80'],['Laptop','Electronics','85000.00','15'],['Headphones','Electronics','2500.00','60'],['Desk','Furniture','12000.00','8'],['Chair','Furniture','6500.00','25']], hidden: true },
      ]
    },

    // ─── 9. HAVING clause ────────────────────────────────────────────────────────
    {
      id: 'sql-having-filter',
      title: 'SQL-09: High-Value Product Categories',
      category: 'Aggregation & GROUP BY',
      difficulty: 'Medium',
      language: 'sql',
      description: `### SQL-09: High-Value Product Categories

Find product **categories** where the **total stock value** (price × stock) exceeds **₹500,000**. 

Return category and total_value, sorted by total_value DESC.

**Expected columns:** \`category, total_value\`

---
**Hint:**
- \`SUM(price * stock)\` in GROUP BY
- Filter with HAVING`,

      schema: `CREATE TABLE products (
  id INT PRIMARY KEY,
  product_name VARCHAR(100),
  category VARCHAR(50),
  price DECIMAL(10,2),
  stock INT
);
INSERT INTO products VALUES
  (1,'Laptop','Electronics',85000.00,15),
  (2,'Headphones','Electronics',2500.00,60),
  (3,'Desk','Furniture',12000.00,8),
  (4,'Chair','Furniture',6500.00,25),
  (5,'Python Book','Books',899.00,100),
  (6,'SQL Guide','Books',750.00,80),
  (7,'Monitor','Electronics',25000.00,20);`,

      starterCode: `-- Find categories where total stock value (price*stock) > 500000
-- Columns: category, total_value | Sort: total_value DESC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['Electronics', '1925000.00']], hidden: false },
        { id: 2, setup: "INSERT INTO products VALUES (8,'Sofa','Furniture',30000.00,20);", expected: [['Electronics', '1925000.00'], ['Furniture', '858500.00']], hidden: false },
        { id: 3, setup: "DELETE FROM products WHERE category='Electronics';", expected: [], hidden: false },
        { id: 4, setup: "INSERT INTO products VALUES (9,'Notebook','Books',500.00,1010);", expected: [['Electronics', '1925000.00'], ['Books', '654900.00']], hidden: false },
        { id: 5, setup: "UPDATE products SET stock=1 WHERE category='Electronics';", expected: [], hidden: true },
        { id: 6, setup: "UPDATE products SET price=1.00 WHERE category='Electronics';", expected: [], hidden: true },
        { id: 7, input: '', expected: [['Electronics', '1925000.00']], hidden: true },
        { id: 8, setup: "UPDATE products SET stock=100 WHERE category='Furniture';", expected: [['Electronics', '1925000.00'], ['Furniture', '1850000.00']], hidden: true },
        { id: 9, setup: "DELETE FROM products WHERE id=7;", expected: [['Electronics', '1425000.00']], hidden: true },
        { id: 10, input: '', expected: [['Electronics', '1925000.00']], hidden: true },
        { id: 11, setup: "INSERT INTO products VALUES (10,'Tablet','Electronics',40000.00,20);", expected: [['Electronics', '2725000.00']], hidden: true },
        { id: 12, setup: "UPDATE products SET price=price*2;", expected: [['Electronics', '3850000.00'], ['Furniture', '517000.00']], hidden: true },
      ]
    },

    // ─── 10. String Functions ────────────────────────────────────────────────────
    {
      id: 'sql-string-functions',
      title: 'SQL-10: Customer Email Domain Analysis',
      category: 'String Functions',
      difficulty: 'Medium',
      language: 'sql',
      description: `### SQL-10: Customer Email Domain Analysis

Given a \`customers\` table with email addresses, write a query to:
1. Extract the **domain** part of each email (after the @)
2. Count customers per domain
3. Only show domains with **2 or more** customers
4. Sort by count DESC, domain ASC

**Expected columns:** \`domain, customer_count\`

---
**Hints:**
- MySQL: \`SUBSTRING_INDEX(email, '@', -1)\`
- SQLite: \`SUBSTR(email, INSTR(email, '@') + 1)\``,

      schema: `CREATE TABLE customers (
  id INT PRIMARY KEY,
  name VARCHAR(50),
  email VARCHAR(100)
);
INSERT INTO customers VALUES
  (1,'Alice','alice@gmail.com'),
  (2,'Bob','bob@yahoo.com'),
  (3,'Charlie','charlie@gmail.com'),
  (4,'Diana','diana@company.com'),
  (5,'Eve','eve@gmail.com'),
  (6,'Frank','frank@yahoo.com'),
  (7,'Grace','grace@company.com'),
  (8,'Henry','henry@outlook.com');`,

      starterCode: `-- Extract domain from email and count customers per domain
-- Only domains with >= 2 customers
-- Columns: domain, customer_count | Sort: customer_count DESC, domain ASC

SELECT `,

      testcases: [
        { id: 1, input: '', expected: [['gmail.com','3'],['company.com','2'],['yahoo.com','2']], hidden: false },
        { id: 2, setup: "INSERT INTO customers VALUES (9,'Ivy','ivy@gmail.com');", expected: [['gmail.com','4'],['company.com','2'],['yahoo.com','2']], hidden: false },
        { id: 3, setup: "INSERT INTO customers VALUES (9,'Jake','jake@outlook.com');", expected: [['gmail.com','3'],['company.com','2'],['outlook.com','2'],['yahoo.com','2']], hidden: false },
        { id: 4, setup: "DELETE FROM customers WHERE email LIKE '%yahoo.com';", expected: [['gmail.com','3'],['company.com','2']], hidden: false },
        { id: 5, setup: "UPDATE customers SET email='new@gmail.com' WHERE name='Diana';", expected: [['gmail.com','4'],['yahoo.com','2']], hidden: true },
        { id: 6, setup: "DELETE FROM customers WHERE email LIKE '%gmail.com' AND id > 1;", expected: [['company.com','2'],['yahoo.com','2']], hidden: true },
        { id: 7, expected: [['gmail.com','3'],['company.com','2'],['yahoo.com','2']], hidden: true },
        { id: 8, setup: "DELETE FROM customers;", expected: [], hidden: true },
        { id: 9, expected: [['gmail.com','3'],['company.com','2'],['yahoo.com','2']], hidden: true },
        { id: 10, setup: "INSERT INTO customers VALUES (9,'X','x@gmail.com'),(10,'Y','y@gmail.com'),(11,'Z','z@gmail.com');", expected: [['gmail.com','6'],['company.com','2'],['yahoo.com','2']], hidden: true },
        { id: 11, setup: "UPDATE customers SET email=REPLACE(email,'yahoo.com','gmail.com');", expected: [['gmail.com','5'],['company.com','2']], hidden: true },
        { id: 12, setup: "INSERT INTO customers VALUES (9,'A','a@test.io'),(10,'B','b@test.io');", expected: [['gmail.com','3'],['company.com','2'],['test.io','2'],['yahoo.com','2']], hidden: true },
      ]
    },

  ];

  // ── Public API ────────────────────────────────────────────────────────────────

  function getCategories() { return CATEGORIES; }
  function getCatalog()    { return CATALOG; }

  function getRandomProblem(category = null, difficulty = null) {
    let pool = CATALOG;
    if (category && category !== 'All' && category !== 'General' && category !== 'custom_multi') {
      let catList = [];
      if (Array.isArray(category)) {
        catList = category.map(c => String(c).trim()).filter(Boolean);
      } else if (category instanceof Set) {
        catList = Array.from(category).map(c => String(c).trim()).filter(Boolean);
      } else if (typeof category === 'string') {
        catList = category.split(',').map(c => c.trim()).filter(Boolean);
      }

      if (catList.length > 0 && !catList.includes('All')) {
        const catLowers = catList.map(c => c.toLowerCase());
        const filtered = pool.filter(p => {
          const pCat = (p.category || '').toLowerCase();
          return catLowers.some(c => pCat.includes(c) || c.includes(pCat));
        });
        if (filtered.length) pool = filtered;
      }
    }
    if (difficulty && difficulty !== 'Any') {
      const diffPool = pool.filter(p => p.difficulty.toLowerCase() === difficulty.toLowerCase());
      if (diffPool.length) pool = diffPool;
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function findProblemByTopic(topic, category = null, difficulty = null) {
    if (!topic || topic.trim() === '' || topic.trim().toLowerCase() === 'random') {
      return getRandomProblem(category, difficulty);
    }
    const t = topic.trim().toLowerCase();
    const direct = CATALOG.find(p =>
      p.title.toLowerCase().includes(t) ||
      p.id.toLowerCase().includes(t) ||
      t.includes(p.id.toLowerCase())
    );
    if (direct) return direct;

    let catList = [];
    if (Array.isArray(category)) {
      catList = category.map(c => String(c).trim()).filter(Boolean);
    } else if (category instanceof Set) {
      catList = Array.from(category).map(c => String(c).trim()).filter(Boolean);
    } else if (typeof category === 'string') {
      catList = category.split(',').map(c => c.trim()).filter(Boolean);
    }

    if (catList.length > 0 && !catList.includes('All')) {
      const catLowers = catList.map(c => c.toLowerCase());
      const catMatch = CATALOG.find(p => {
        const pCat = (p.category || '').toLowerCase();
        return catLowers.some(c => pCat.includes(c) || c.includes(pCat));
      });
      if (catMatch) return catMatch;
    }

    const nameMatch = CATALOG.find(p => p.category.toLowerCase().includes(t) || t.includes(p.category.toLowerCase()));
    if (nameMatch) return nameMatch;

    return getRandomProblem(category, difficulty);
  }

  return { getCategories, getCatalog, getRandomProblem, findProblemByTopic };

})();

if (typeof window !== 'undefined') {
  window.SQL_CATALOG = SQL_CATALOG;
}
