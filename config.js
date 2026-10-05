/**
 * config.js – ProctorIQ Configuration
 */
const CONFIG = {
  // Proxy endpoint
  TAUFA_CHAT_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/proxy/api/chat'
    : '/proxy/api/chat',

  // OmniRoute local server (OpenAI-compatible, auto-started at launch)
  OMNIROUTE_URL: 'http://localhost:20128/v1/chat/completions',

  // Settings & proctor API
  SETTINGS_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/settings'
    : '/api/settings',

  PROCTOR_SCAN_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/proctor-scan'
    : '/api/proctor-scan',

  // Native Fullscreen API URLs
  FULLSCREEN_ENTER_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/fullscreen/enter'
    : '/api/fullscreen/enter',

  FULLSCREEN_EXIT_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/fullscreen/exit'
    : '/api/fullscreen/exit',

  FULLSCREEN_TOGGLE_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/fullscreen/toggle'
    : '/api/fullscreen/toggle',

  // In-built Python & SQLite Compiler URL
  RUN_CODE_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/run-code'
    : '/api/run-code',

  // Admin Portal API URLs
  ADMIN_LOGIN_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/login'
    : '/api/admin/login',

  ADMIN_RECORDS_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/records'
    : '/api/admin/records',

  ADMIN_CUSTOM_TESTS_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/custom-tests'
    : '/api/admin/custom-tests',

  ADMIN_PROCTOR_CONFIG_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/proctor-config'
    : '/api/admin/proctor-config',

  ADMIN_ACTIVE_ASSIGNMENT_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/active-assignment'
    : '/api/admin/active-assignment',

  ADMIN_SYSTEM_CONFIG_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/system-config'
    : '/api/admin/system-config',

  ADMIN_START_OMNIROUTE_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/start-omniroute'
    : '/api/admin/start-omniroute',

  ADMIN_OMNIROUTE_STATUS_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/omniroute-status'
    : '/api/admin/omniroute-status',

  ADMIN_TEST_OMNIROUTE_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/test-omniroute'
    : '/api/admin/test-omniroute',

  ADMIN_TEST_TAUFA_URL: (typeof window !== 'undefined' && window.location.protocol === 'file:')
    ? 'http://localhost:3000/api/admin/test-taufa'
    : '/api/admin/test-taufa',

  // Custom prompt templates customizable by administrator
  CUSTOM_PROMPTS: {
    mcq: null,
    coding: null,
    sql: null
  },

  // Fixed conversation ID (your existing taufa chat session)
  CONVERSATION_ID: '000e9900-de38-46e9-aa31-c5f36d696dc3',

  // Proctoring thresholds & defaults
  MAX_TAB_SWITCHES: 1,
  MAX_SOUND_WARNINGS: 10,
  MAX_AWAY_SECONDS: 25,
  LIGHTING_GUARD: true,
  ANTI_AI_SCANNER: true,
  FULLSCREEN_LOCKDOWN: true,
  DUAL_AI_VERIFICATION: true,
  DETECTION_INTERVAL_MS: 3000,

  // Generate a UUID v4
  uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  },

  // Build a single user message in Taufa's format
  buildMessage(text, parentId = null) {
    const id = this.uuid();
    return {
      id,
      role: 'user',
      parts: [{ type: 'text', text }],
      metadata: {
        modelUsed: null,
        taskCategory: null,
        createdAt: new Date().toISOString(),
        parentMessageId: parentId,
        siblingIds: [id],
        siblingIndex: 0,
      },
    };
  },

  // Build the full request body for /api/chat
  buildBody(userText, history = []) {
    const convId = this.CONVERSATION_ID;
    const userMsg = this.buildMessage(userText, history.length > 0 ? history[history.length - 1].id : null);
    return {
      conversationId: convId,
      toolMode: 'auto',
      id: convId,
      messages: [...history, userMsg],
    };
  },

  // 20 Distinct Pedagogical Perspectives for MCQ Generation (to guarantee completely varied questions)
  MCQ_PROMPT_VARIATIONS: [
    {
      angle: 'Production Bug Diagnosis & Code Tracing',
      focus: 'Real-world software debugging, edge case tracing, execution output prediction, and root-cause analysis.',
      instruction: 'Include practical code snippets, subtle logic traps, and unexpected runtime outputs.'
    },
    {
      angle: 'Architecture & System Design Principles',
      focus: 'Structural design trade-offs, modularity, coupling vs cohesion, design patterns (SOLID, Factory, Observer), and component boundaries.',
      instruction: 'Focus on choosing the optimal architectural approach and evaluating design trade-offs.'
    },
    {
      angle: 'Deep Internal Mechanics & Memory Management',
      focus: 'Low-level internals, memory allocation (stack vs heap), garbage collection, reference counting, pointers, and runtime lifecycle.',
      instruction: 'Test candidate understanding of how execution models work under the hood.'
    },
    {
      angle: 'Algorithmic Complexity & Big-O Performance',
      focus: 'Time and space complexity trade-offs, worst-case vs average-case behavior, amortized cost, and scaling bottlenecks.',
      instruction: 'Include questions comparing multiple algorithmic approaches for data volume scaling.'
    },
    {
      angle: 'Security Pitfalls & Defensive Engineering',
      focus: 'Common vulnerabilities (injection, overflow, deserialization, race conditions), input sanitization, and secure defaults.',
      instruction: 'Ask how to detect, prevent, or mitigate critical security vulnerabilities.'
    },
    {
      angle: 'Modern Language Idioms & Subtle Syntax Traps',
      focus: 'Nuances of modern language features, operator precedence, type coercion, scoping (lexical, closure), and syntax subtleties.',
      instruction: 'Challenge candidates on subtle differences that catch even experienced developers.'
    },
    {
      angle: 'Concurrency, Threading & Asynchronous Patterns',
      focus: 'Multi-threading, deadlocks, race conditions, async/await, event loops, promises, mutexes, and thread-safe data access.',
      instruction: 'Test understanding of concurrent execution, synchronization primitives, and non-blocking I/O.'
    },
    {
      angle: 'Error Handling, Resilience & Recovery',
      focus: 'Exception hierarchies, graceful degradation, circuit breakers, retry policies, transaction rollbacks, and fail-safe design.',
      instruction: 'Emphasize robust fault handling and resilient state preservation during failures.'
    },
    {
      angle: 'Database Normalization, Indexing & Query Execution',
      focus: 'Relational vs non-relational trade-offs, B-Tree indexes, composite keys, query optimization, execution plans, and ACID isolation levels.',
      instruction: 'Focus on query performance, indexing traps, and transaction concurrency anomalies.'
    },
    {
      angle: 'Data Structures Selection & Spatial Trade-offs',
      focus: 'Hash tables vs Trees vs Tries vs Heaps, cache locality, memory overhead, lookup/insertion trade-offs, and specialized structures.',
      instruction: 'Present practical constraints (e.g. read-heavy vs memory-constrained) and ask for the best data structure.'
    },
    {
      angle: 'Anti-Patterns, Code Smells & Refactoring',
      focus: 'Identifying bad coding habits, leaky abstractions, God objects, shotgun surgery, premature optimization, and applying clean refactoring.',
      instruction: 'Present flawed design scenarios and ask for the most effective refactoring solution.'
    },
    {
      angle: 'API Design, Protocol Standards & REST/GraphQL',
      focus: 'Idempotency, HTTP status codes, RESTful resource design, GraphQL schemas, contract versioning, pagination, and payload efficiency.',
      instruction: 'Focus on practical, clean API interface design and client-server communication standards.'
    },
    {
      angle: 'Testing Strategies, Mocking & Boundary Validation',
      focus: 'Unit vs Integration vs End-to-End testing, test doubles (mocks, stubs, spies), boundary value analysis, and equivalence partitioning.',
      instruction: 'Ask how to verify complex behaviors and edge case coverage reliably.'
    },
    {
      angle: 'Real-World Production Incidents & Post-Mortems',
      focus: 'Troubleshooting live outages, CPU spikes, memory leaks, connection pool exhaustion, and cascading failure propagation.',
      instruction: 'Frame questions as real-world incident alerts where candidates diagnose the root problem.'
    },
    {
      angle: 'Numerical Computation, Types & Precision Hazards',
      focus: 'IEEE 754 floating-point inaccuracies, integer overflow, big numbers, type casting hazards, and mathematical rounding anomalies.',
      instruction: 'Include practical math/computation traps that cause subtle bugs in production.'
    },
    {
      angle: 'Caching Strategies, Invalidation & Distributed State',
      focus: 'Cache-aside, write-through, LRU/LFU eviction, cache stampede prevention, TTL policies, and cache consistency trade-offs.',
      instruction: 'Focus on managing cached data, cache invalidation strategies, and latency reduction.'
    },
    {
      angle: 'Object-Oriented vs Functional vs Declarative Paradigms',
      focus: 'Immutability, pure functions, side-effects, inheritance vs composition, polymorphism, and declarative pipelines.',
      instruction: 'Compare paradigms and evaluate code behavior across different programming methodologies.'
    },
    {
      angle: 'Standard Library Internals & Core Utilities',
      focus: 'High-performance standard library algorithms, collection methods, regex engines, sorting algorithms, and utility modules.',
      instruction: 'Explore standard library features and their optimal, intended usage.'
    },
    {
      angle: 'High-Scalability, Load Balancing & Partitioning',
      focus: 'Horizontal vs vertical scaling, consistent hashing, sharding, message queues, event-driven architectures, and backpressure.',
      instruction: 'Ask how to handle sudden 10x spikes in traffic and prevent single points of failure.'
    },
    {
      angle: 'Comprehensive Multi-Domain Synthesis',
      focus: 'Holistic assessment synthesizing algorithmic logic, clean architecture, security, and edge-case handling across the topic.',
      instruction: 'Present multifaceted challenges that test complete domain mastery.'
    }
  ],

  // MCQ quiz prompt sent to Taufa with rotating 20-variation diversity engine
  buildQuizPrompt(topic, numQ, taglines = '', variantIndex = null) {
    const vars = this.MCQ_PROMPT_VARIATIONS;
    let cycle = variantIndex;
    if (cycle === null || cycle === undefined) {
      try {
        let cur = parseInt(localStorage.getItem('proctoriq_mcq_cycle') || '0', 10);
        cycle = cur % vars.length;
        localStorage.setItem('proctoriq_mcq_cycle', String((cur + 1) % vars.length));
      } catch (_) {
        cycle = Math.floor(Math.random() * vars.length);
      }
    }
    const variant = vars[Math.abs(cycle) % vars.length];
    const sessionNonce = `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 7)}`;
    const focusClause = (taglines && String(taglines).trim()) ? ` Emphasize and cover questions across these specific subtopics/taglines: ${String(taglines).trim()}.` : '';

    if (this.CUSTOM_PROMPTS && this.CUSTOM_PROMPTS.mcq) {
      let p = this.CUSTOM_PROMPTS.mcq.replace(/\{topic\}/g, topic).replace(/\{numQ\}/g, numQ);
      if (focusClause) p += focusClause;
      p += `\n[Angle #${(Math.abs(cycle) % vars.length) + 1}/20: ${variant.angle} - ${variant.instruction}] [Seed: #${sessionNonce}]`;
      return p;
    }

    return `Create an expert, non-repetitive multiple-choice assessment on: "${topic}" (${numQ} questions).
[Assessment Perspective #${(Math.abs(cycle) % vars.length) + 1} of 20: ${variant.angle}]
Primary Angle Focus: ${variant.focus}
Directive: ${variant.instruction}${focusClause}

CRITICAL DIVERSITY REQUIREMENT:
1. Do NOT generate generic or textbook intro questions (avoid "What is...", "Which of the following is true...").
2. Ensure 100% fresh, practical, scenario-based or code-tracing problems.
3. Every question must test deep conceptual competence and end with "?".
4. Choices must be labeled exactly "A) ...", "B) ...", "C) ...", "D) ...".
5. Clearly specify the 0-indexed correct answer (0 for A, 1 for B, 2 for C, 3 for D). Include multiple answers with "multi": true where appropriate.
6. Unique Generation Session: #${sessionNonce}.

Return ONLY valid JSON in this exact structure:
{"quiz": [{"question": "...", "choices": ["A) ...", "B) ...", "C) ...", "D) ..."], "answer": 0, "multi": false}]}`;
  },

  // LeetCode prompt with multi-language starter templates (Python, Java, C++, C) and 10-15 testcases
  buildLeetCodePrompt(topic, category = 'General', difficulty = 'Medium') {
    if (this.CUSTOM_PROMPTS && this.CUSTOM_PROMPTS.coding) {
      return this.CUSTOM_PROMPTS.coding
        .replace(/\{topic\}/g, topic)
        .replace(/\{category\}/g, category)
        .replace(/\{difficulty\}/g, difficulty);
    }
    return `Create an authentic LeetCode coding problem on: "${topic}" (Category: ${category}, Difficulty: ${difficulty}).
Generate exactly 12-15 testcases (first 4 visible with clear input/expected, remaining 8-11 hidden edge cases).
Provide starter templates for Python, Java, C++, and C.
Return ONLY valid JSON in this exact structure:
{
  "coding": {
    "title": "LeetCode Title (e.g. 1. Two Sum)",
    "category": "${category}",
    "difficulty": "${difficulty}",
    "description": "Full problem description in markdown with algorithmic requirements, Examples (Example 1, Example 2 with Input/Output/Explanation), and Constraints (e.g. 1 <= n <= 10^5).",
    "starterCodes": {
      "python": "class Solution:\\n    def solution(self, *args):\\n        # Write solution here\\n        pass",
      "java": "import java.util.*;\\n\\npublic class Solution {\\n    // Write solution method here\\n\\n    public static void main(String[] args) {\\n        Scanner sc = new Scanner(System.in);\\n        // Test runner driver\\n    }\\n}",
      "cpp": "#include <iostream>\\n#include <vector>\\n#include <string>\\n#include <unordered_map>\\n#include <algorithm>\\nusing namespace std;\\n\\nclass Solution {\\npublic:\\n    // Write solution method here\\n};\\n\\nint main() {\\n    // Test runner driver\\n    return 0;\\n}",
      "c": "#include <stdio.h>\\n#include <stdlib.h>\\n#include <string.h>\\n\\n// Write solution function here\\n\\nint main() {\\n    // Test runner driver\\n    return 0;\\n}"
    },
    "testcases": [
      { "id": 1, "input": "...", "expected": "...", "hidden": false },
      { "id": 2, "input": "...", "expected": "...", "hidden": false },
      { "id": 3, "input": "...", "expected": "...", "hidden": false },
      { "id": 4, "input": "...", "expected": "...", "hidden": false },
      { "id": 5, "input": "...", "expected": "...", "hidden": true },
      { "id": 6, "input": "...", "expected": "...", "hidden": true },
      { "id": 7, "input": "...", "expected": "...", "hidden": true },
      { "id": 8, "input": "...", "expected": "...", "hidden": true },
      { "id": 9, "input": "...", "expected": "...", "hidden": true },
      { "id": 10, "input": "...", "expected": "...", "hidden": true },
      { "id": 11, "input": "...", "expected": "...", "hidden": true },
      { "id": 12, "input": "...", "expected": "...", "hidden": true }
    ]
  }
}`;
  },

  // Coding challenge prompt sent to Taufa with 10-15 testcases
  buildCodingPrompt(topic, language = 'python') {
    if (language === 'sql') {
      if (this.CUSTOM_PROMPTS && this.CUSTOM_PROMPTS.sql) {
        return this.CUSTOM_PROMPTS.sql.replace(/\{topic\}/g, topic);
      }
      return `Create a comprehensive SQL database query challenge on: "${topic}".
Generate exactly 12 testcases.
Return ONLY valid JSON in this exact structure:
{
  "coding": {
    "title": "SQL Problem Title",
    "language": "sql",
    "difficulty": "Medium",
    "description": "Clear problem statement describing the business requirement, tables, schema, and expected result columns and order.",
    "schema": "CREATE TABLE employees (id INT, name TEXT, salary INT, department TEXT); INSERT INTO employees VALUES (1, 'Alice', 70000, 'Engineering'), (2, 'Bob', 48000, 'HR'), (3, 'Charlie', 82000, 'Engineering'), (4, 'Diana', 95000, 'Leadership');",
    "starterCode": "-- Write your SQL solution below\\nSELECT ",
    "testcases": [
      { "id": 1, "description": "Base case", "expected": [["Diana", "95000"], ["Charlie", "82000"]], "hidden": false },
      { "id": 2, "description": "Secondary case", "expected": [["Alice", "70000"]], "hidden": false },
      { "id": 3, "description": "Empty check", "setup": "DELETE FROM employees WHERE department='Engineering';", "expected": [], "hidden": false },
      { "id": 4, "description": "Large values", "setup": "INSERT INTO employees VALUES (5, 'Evan', 120000, 'Engineering');", "expected": [["Evan", "120000"]], "hidden": true },
      { "id": 5, "description": "Duplicate salary check", "hidden": true },
      { "id": 6, "description": "Hidden test 6", "hidden": true },
      { "id": 7, "description": "Hidden test 7", "hidden": true },
      { "id": 8, "description": "Hidden test 8", "hidden": true },
      { "id": 9, "description": "Hidden test 9", "hidden": true },
      { "id": 10, "description": "Hidden test 10", "hidden": true },
      { "id": 11, "description": "Hidden test 11", "hidden": true },
      { "id": 12, "description": "Boundary test 12", "hidden": true }
    ]
  }
}`;
    }

    return this.buildLeetCodePrompt(topic, 'Coding', 'Medium');
  },
};
