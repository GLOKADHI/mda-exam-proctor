/**
 * leetcode.js – Comprehensive LeetCode Problem Catalog & Multi-Language Template Engine
 * Supports Python 3.14, Java 11, C++ (g++), and C (gcc) with 10-15 automated testcases.
 */

const LEETCODE = (() => {

  const CATEGORIES = [
    { id: 'super_easy', name: 'Super Easy', icon: '🐣', topics: ['Add Two Integers', 'Even or Odd Number', 'Return Hello World'] },
    { id: 'arrays', name: 'Arrays & Hashing', icon: '🗃️', topics: ['Two Sum', 'Contains Duplicate', 'Valid Anagram', 'Product of Array Except Self', 'Group Anagrams'] },
    { id: 'two_pointers', name: 'Two Pointers', icon: '🎯', topics: ['Valid Palindrome', 'Two Sum II', '3Sum', 'Container With Most Water', 'Trapping Rain Water'] },
    { id: 'sliding_window', name: 'Sliding Window', icon: '🪟', topics: ['Best Time to Buy and Sell Stock', 'Longest Substring Without Repeating Characters', 'Permutation in String'] },
    { id: 'stack', name: 'Stack & Queues', icon: '📚', topics: ['Valid Parentheses', 'Min Stack', 'Daily Temperatures', 'Evaluate Reverse Polish Notation'] },
    { id: 'binary_search', name: 'Binary Search', icon: '🔍', topics: ['Binary Search', 'Search a 2D Matrix', 'Find Minimum in Rotated Sorted Array', 'Search in Rotated Sorted Array'] },
    { id: 'linked_list', name: 'Linked List', icon: '🔗', topics: ['Reverse Linked List', 'Merge Two Sorted Lists', 'Linked List Cycle', 'Remove Nth Node From End'] },
    { id: 'trees', name: 'Trees & BST', icon: '🌳', topics: ['Invert Binary Tree', 'Maximum Depth of Binary Tree', 'Same Tree', 'Lowest Common Ancestor'] },
    { id: 'heap', name: 'Heap / Priority Queue', icon: '⛰️', topics: ['Kth Largest Element', 'Last Stone Weight', 'Top K Frequent Elements'] },
    { id: 'backtracking', name: 'Backtracking', icon: '🔄', topics: ['Subsets', 'Combination Sum', 'Permutations', 'Word Search'] },
    { id: 'graphs', name: 'Graphs & BFS/DFS', icon: '🕸️', topics: ['Number of Islands', 'Clone Graph', 'Max Area of Island', 'Rotting Oranges'] },
    { id: 'dp_1d', name: '1-D Dynamic Programming', icon: '📈', topics: ['Climbing Stairs', 'House Robber', 'Coin Change', 'Word Break'] },
    { id: 'dp_2d', name: '2-D Dynamic Programming', icon: '🧩', topics: ['Unique Paths', 'Longest Common Subsequence', 'Edit Distance'] },
    { id: 'greedy', name: 'Greedy', icon: '⚡', topics: ['Maximum Subarray', 'Jump Game', 'Gas Station', 'Partition Labels'] },
    { id: 'intervals', name: 'Intervals', icon: '⏱️', topics: ['Merge Intervals', 'Insert Interval', 'Non-overlapping Intervals'] },
    { id: 'math', name: 'Math & Geometry', icon: '🔢', topics: ['Rotate Image', 'Spiral Matrix', 'Pow(x, n)', 'Happy Number'] },
    { id: 'bit', name: 'Bit Manipulation', icon: '💻', topics: ['Single Number', 'Number of 1 Bits', 'Counting Bits', 'Reverse Bits'] }
  ];

  const CATALOG = [
    // 0. Add Two Integers (Super Easy)
    {
      id: 'add-two-integers',
      number: 2235,
      title: '2235. Add Two Integers',
      category: 'Super Easy',
      difficulty: 'Super Easy',
      description: `### 2235. Add Two Integers

Given two integers \`num1\` and \`num2\`, return *the sum of the two integers*.

This is a **Super Easy** foundational coding challenge designed to verify your compiler environment, smart indentation, and test case execution.

---
### Example 1:
\`\`\`
Input: num1 = 12, num2 = 5
Output: 17
Explanation: num1 is 12, num2 is 5, and their sum is 12 + 5 = 17, so 17 is returned.
\`\`\`

### Example 2:
\`\`\`
Input: num1 = -10, num2 = 4
Output: -6
Explanation: -10 + 4 = -6, so -6 is returned.
\`\`\`

---
### Constraints:
- \`-100 <= num1, num2 <= 100\``,
      starterCodes: {
        python: `class Solution:
    def sum(self, num1: int, num2: int) -> int:
        # Write your code here: return the sum of num1 and num2
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int sum(int num1, int num2) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int num1 = sc.nextInt();
        int num2 = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.sum(num1, num2));
    }
}
`,
        cpp: `#include <iostream>
using namespace std;

class Solution {
public:
    int sum(int num1, int num2) {
        // Write your code here
        return 0;
    }
};

int main() {
    int num1, num2;
    if (!(cin >> num1 >> num2)) return 0;
    Solution sol;
    cout << sol.sum(num1, num2) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>

int sum(int num1, int num2) {
    // Write your code here
    return 0;
}

int main() {
    int num1, num2;
    if (scanf("%d %d", &num1, &num2) != 2) return 0;
    printf("%d\\n", sum(num1, num2));
    return 0;
}
`
      },
      starterCode: `class Solution:
    def sum(self, num1: int, num2: int) -> int:
        # Write your code here: return the sum of num1 and num2
        pass
`,
      testcases: [
        { id: 1, input: "12\n5", expected: "17", hidden: false },
        { id: 2, input: "-10\n4", expected: "-6", hidden: false },
        { id: 3, input: "0\n0", expected: "0", hidden: false },
        { id: 4, input: "100\n100", expected: "200", hidden: false },
        { id: 5, input: "-50\n-50", expected: "-100", hidden: true },
        { id: 6, input: "7\n3", expected: "10", hidden: true },
        { id: 7, input: "-25\n50", expected: "25", hidden: true },
        { id: 8, input: "99\n-1", expected: "98", hidden: true },
        { id: 9, input: "-100\n100", expected: "0", hidden: true },
        { id: 10, input: "42\n58", expected: "100", hidden: true },
        { id: 11, input: "-15\n-35", expected: "-50", hidden: true },
        { id: 12, input: "1\n-1", expected: "0", hidden: true }
      ]
    },

    // 1. Two Sum
    {
      id: 'two-sum',
      number: 1,
      title: '1. Two Sum',
      category: 'Arrays & Hashing',
      difficulty: 'Easy',
      description: `### 1. Two Sum

Given an array of integers \`nums\` and an integer \`target\`, return *indices of the two numbers such that they add up to \`target\`*.

You may assume that each input would have **exactly one solution**, and you may not use the *same* element twice.

You can return the answer in any order.

---
### Example 1:
\`\`\`
Input: nums = [2,7,11,15], target = 9
Output: [0,1]
Explanation: Because nums[0] + nums[1] == 9, we return [0, 1].
\`\`\`

### Example 2:
\`\`\`
Input: nums = [3,2,4], target = 6
Output: [1,2]
\`\`\`

### Example 3:
\`\`\`
Input: nums = [3,3], target = 6
Output: [0,1]
\`\`\`

---
### Constraints:
- \`2 <= nums.length <= 10^4\`
- \`-10^9 <= nums[i] <= 10^9\`
- \`-10^9 <= target <= 10^9\`
- Only one valid answer exists.`,
      starterCodes: {
        python: `class Solution:
    def twoSum(self, nums: list[int], target: int) -> list[int]:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Write your code here
        return new int[]{};
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
        int target = sc.nextInt();
        Solution sol = new Solution();
        int[] ans = sol.twoSum(nums, target);
        System.out.println(Arrays.toString(ans));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
#include <unordered_map>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Write your code here
        return {};
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target;
    cin >> target;
    Solution sol;
    vector<int> ans = sol.twoSum(nums, target);
    cout << "[" << ans[0] << ", " << ans[1] << "]" << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    // Write your code here
    *returnSize = 0;
    return NULL;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* nums = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
    int target;
    scanf("%d", &target);
    int returnSize = 0;
    int* ans = twoSum(nums, n, target, &returnSize);
    printf("[%d, %d]\\n", ans[0], ans[1]);
    free(nums);
    free(ans);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "4\n2 7 11 15\n9", expected: "[0, 1]", hidden: false },
        { id: 2, input: "3\n3 2 4\n6", expected: "[1, 2]", hidden: false },
        { id: 3, input: "2\n3 3\n6", expected: "[0, 1]", hidden: false },
        { id: 4, input: "4\n1 5 8 3\n8", expected: "[1, 3]", hidden: false },
        { id: 5, input: "4\n10 -2 5 8\n3", expected: "[1, 2]", hidden: true },
        { id: 6, input: "2\n0 0\n0", expected: "[0, 1]", hidden: true },
        { id: 7, input: "3\n100 200 300\n500", expected: "[1, 2]", hidden: true },
        { id: 8, input: "3\n-5 -3 -1\n-4", expected: "[1, 2]", hidden: true },
        { id: 9, input: "5\n1 2 3 4 5\n9", expected: "[3, 4]", hidden: true },
        { id: 10, input: "3\n7 14 21\n28", expected: "[0, 2]", hidden: true },
        { id: 11, input: "3\n50 25 75\n125", expected: "[0, 2]", hidden: true },
        { id: 12, input: "4\n9 1 8 2\n10", expected: "[0, 1]", hidden: true },
        { id: 13, input: "4\n1 2 3 6\n7", expected: "[0, 3]", hidden: true },
        { id: 14, input: "5\n-10 -1 -18 -19 20\n-29", expected: "[0, 3]", hidden: true },
        { id: 15, input: "6\n1 4 7 11 15 20\n35", expected: "[4, 5]", hidden: true }
      ]
    },

    // 2. Valid Palindrome
    {
      id: 'valid-palindrome',
      number: 125,
      title: '125. Valid Palindrome',
      category: 'Two Pointers',
      difficulty: 'Easy',
      description: `### 125. Valid Palindrome

A phrase is a **palindrome** if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Alphanumeric characters include letters and numbers.

Given a string \`s\`, return \`true\` *if it is a palindrome, or* \`false\` *otherwise*.

---
### Example 1:
\`\`\`
Input: s = "A man, a plan, a canal: Panama"
Output: true
Explanation: "amanaplanacanalpanama" is a palindrome.
\`\`\`

### Example 2:
\`\`\`
Input: s = "race a car"
Output: false
Explanation: "raceacar" is not a palindrome.
\`\`\`

### Example 3:
\`\`\`
Input: s = " "
Output: true
Explanation: s is an empty string "" after removing non-alphanumeric characters.
\`\`\`

---
### Constraints:
- \`1 <= s.length <= 2 * 10^5\`
- \`s\` consists only of printable ASCII characters.`,
      starterCodes: {
        python: `class Solution:
    def isPalindrome(self, s: str) -> bool:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public boolean isPalindrome(String s) {
        // Write your code here
        return false;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNextLine() ? sc.nextLine() : "";
        Solution sol = new Solution();
        System.out.println(sol.isPalindrome(s));
    }
}
`,
        cpp: `#include <iostream>
#include <string>
#include <cctype>
using namespace std;

class Solution {
public:
    bool isPalindrome(string s) {
        // Write your code here
        return false;
    }
};

int main() {
    string s;
    getline(cin, s);
    Solution sol;
    cout << (sol.isPalindrome(s) ? "true" : "false") << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <string.h>
#include <ctype.h>
#include <stdbool.h>

bool isPalindrome(char* s) {
    // Write your code here
    return false;
}

int main() {
    char s[1000];
    if (fgets(s, sizeof(s), stdin) == NULL) return 0;
    // remove trailing newline
    size_t len = strlen(s);
    if (len > 0 && s[len - 1] == '\\n') s[len - 1] = '\\0';
    printf("%s\\n", isPalindrome(s) ? "true" : "false");
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "A man, a plan, a canal: Panama", expected: "true", hidden: false },
        { id: 2, input: "race a car", expected: "false", hidden: false },
        { id: 3, input: " ", expected: "true", hidden: false },
        { id: 4, input: "Was it a car or a cat I saw?", expected: "true", hidden: false },
        { id: 5, input: "Madam, I'm Adam", expected: "true", hidden: true },
        { id: 6, input: "0P", expected: "false", hidden: true },
        { id: 7, input: "ab_a", expected: "true", hidden: true },
        { id: 8, input: "No 'x' in Nixon", expected: "true", hidden: true },
        { id: 9, input: "12321", expected: "true", hidden: true },
        { id: 10, input: "12345", expected: "false", hidden: true },
        { id: 11, input: "a.", expected: "true", hidden: true },
        { id: 12, input: "racecar", expected: "true", hidden: true },
        { id: 13, input: "Never odd or even", expected: "true", hidden: true },
        { id: 14, input: "Eva, can I see bees in a cave?", expected: "true", hidden: true },
        { id: 15, input: "hello world", expected: "false", hidden: true }
      ]
    },

    // 3. Best Time to Buy and Sell Stock
    {
      id: 'best-time-stock',
      number: 121,
      title: '121. Best Time to Buy and Sell Stock',
      category: 'Sliding Window',
      difficulty: 'Easy',
      description: `### 121. Best Time to Buy and Sell Stock

You are given an array \`prices\` where \`prices[i]\` is the price of a given stock on the \`i\`-th day.

You want to maximize your profit by choosing a **single day** to buy one stock and choosing a **different day in the future** to sell that stock.

Return *the maximum profit you can achieve from this transaction*. If you cannot achieve any profit, return \`0\`.

---
### Example 1:
\`\`\`
Input: prices = [7,1,5,3,6,4]
Output: 5
Explanation: Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 6 - 1 = 5.
\`\`\`

### Example 2:
\`\`\`
Input: prices = [7,6,4,3,1]
Output: 0
Explanation: In this case, no transactions are done and the max profit = 0.
\`\`\`

---
### Constraints:
- \`1 <= prices.length <= 10^5\`
- \`0 <= prices[i] <= 10^4\``,
      starterCodes: {
        python: `class Solution:
    def maxProfit(self, prices: list[int]) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int maxProfit(int[] prices) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] prices = new int[n];
        for (int i = 0; i < n; i++) prices[i] = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.maxProfit(prices));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    int maxProfit(vector<int>& prices) {
        // Write your code here
        return 0;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> prices(n);
    for (int i = 0; i < n; i++) cin >> prices[i];
    Solution sol;
    cout << sol.maxProfit(prices) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int maxProfit(int* prices, int pricesSize) {
    // Write your code here
    return 0;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* prices = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &prices[i]);
    printf("%d\\n", maxProfit(prices, n));
    free(prices);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "6\n7 1 5 3 6 4", expected: "5", hidden: false },
        { id: 2, input: "5\n7 6 4 3 1", expected: "0", hidden: false },
        { id: 3, input: "2\n1 2", expected: "1", hidden: false },
        { id: 4, input: "5\n2 4 1 7 5", expected: "6", hidden: false },
        { id: 5, input: "4\n3 2 6 50", expected: "48", hidden: true },
        { id: 6, input: "1\n5", expected: "0", hidden: true },
        { id: 7, input: "6\n1 2 3 4 5 6", expected: "5", hidden: true },
        { id: 8, input: "4\n10 10 10 10", expected: "0", hidden: true },
        { id: 9, input: "5\n10 1 2 1 10", expected: "9", hidden: true },
        { id: 10, input: "6\n8 2 5 1 9 3", expected: "8", hidden: true },
        { id: 11, input: "3\n5 1 2", expected: "1", hidden: true },
        { id: 12, input: "4\n100 50 150 200", expected: "150", hidden: true },
        { id: 13, input: "6\n2 1 2 1 0 1", expected: "1", hidden: true },
        { id: 14, input: "5\n3 2 6 5 0", expected: "4", hidden: true },
        { id: 15, input: "7\n1 4 2 5 7 2 8", expected: "7", hidden: true }
      ]
    },

    // 4. Valid Parentheses
    {
      id: 'valid-parentheses',
      number: 20,
      title: '20. Valid Parentheses',
      category: 'Stack & Queues',
      difficulty: 'Easy',
      description: `### 20. Valid Parentheses

Given a string \`s\` containing just the characters \`'('\`, \`')'\`, \`'{'\`, \`'}'\`, \`'['\` and \`']'\`, determine if the input string is valid.

An input string is valid if:
1. Open brackets must be closed by the same type of brackets.
2. Open brackets must be closed in the correct order.
3. Every close bracket has a corresponding open bracket of the same type.

---
### Example 1:
\`\`\`
Input: s = "()"
Output: true
\`\`\`

### Example 2:
\`\`\`
Input: s = "()[]{}"
Output: true
\`\`\`

### Example 3:
\`\`\`
Input: s = "(]"
Output: false
\`\`\`

---
### Constraints:
- \`1 <= s.length <= 10^4\`
- \`s\` consists of parentheses only \`'()[]{}'.\``,
      starterCodes: {
        python: `class Solution:
    def isValid(self, s: str) -> bool:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public boolean isValid(String s) {
        // Write your code here
        return false;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        String s = sc.hasNext() ? sc.next() : "";
        Solution sol = new Solution();
        System.out.println(sol.isValid(s));
    }
}
`,
        cpp: `#include <iostream>
#include <string>
#include <stack>
using namespace std;

class Solution {
public:
    bool isValid(string s) {
        // Write your code here
        return false;
    }
};

int main() {
    string s;
    cin >> s;
    Solution sol;
    cout << (sol.isValid(s) ? "true" : "false") << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <string.h>
#include <stdbool.h>

bool isValid(char* s) {
    // Write your code here
    return false;
}

int main() {
    char s[10000];
    if (scanf("%s", s) != 1) return 0;
    printf("%s\\n", isValid(s) ? "true" : "false");
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "()", expected: "true", hidden: false },
        { id: 2, input: "()[]{}", expected: "true", hidden: false },
        { id: 3, input: "(]", expected: "false", hidden: false },
        { id: 4, input: "([)]", expected: "false", hidden: false },
        { id: 5, input: "{[]}", expected: "true", hidden: true },
        { id: 6, input: "(", expected: "false", hidden: true },
        { id: 7, input: "]", expected: "false", hidden: true },
        { id: 8, input: "{[()]}", expected: "true", hidden: true },
        { id: 9, input: "(((((())))))", expected: "true", hidden: true },
        { id: 10, input: "((()))]", expected: "false", hidden: true },
        { id: 11, input: "()()()()", expected: "true", hidden: true },
        { id: 12, input: "{{{{", expected: "false", hidden: true },
        { id: 13, input: "(([]){})", expected: "true", hidden: true },
        { id: 14, input: "((())", expected: "false", hidden: true },
        { id: 15, input: "{[()]}{[]}()", expected: "true", hidden: true }
      ]
    },

    // 5. Maximum Subarray
    {
      id: 'maximum-subarray',
      number: 53,
      title: '53. Maximum Subarray',
      category: 'Greedy',
      difficulty: 'Medium',
      description: `### 53. Maximum Subarray

Given an integer array \`nums\`, find the subarray with the largest sum, and return *its sum*.

A **subarray** is a contiguous non-empty sequence of elements within an array.

---
### Example 1:
\`\`\`
Input: nums = [-2,1,-3,4,-1,2,1,-5,4]
Output: 6
Explanation: The subarray [4,-1,2,1] has the largest sum 6.
\`\`\`

### Example 2:
\`\`\`
Input: nums = [1]
Output: 1
\`\`\`

### Example 3:
\`\`\`
Input: nums = [5,4,-1,7,8]
Output: 23
\`\`\`

---
### Constraints:
- \`1 <= nums.length <= 10^5\`
- \`-10^4 <= nums[i] <= 10^4\``,
      starterCodes: {
        python: `class Solution:
    def maxSubArray(self, nums: list[int]) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int maxSubArray(int[] nums) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.maxSubArray(nums));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        // Write your code here
        return 0;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    Solution sol;
    cout << sol.maxSubArray(nums) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int maxSubArray(int* nums, int numsSize) {
    // Write your code here
    return 0;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* nums = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
    printf("%d\\n", maxSubArray(nums, n));
    free(nums);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "9\n-2 1 -3 4 -1 2 1 -5 4", expected: "6", hidden: false },
        { id: 2, input: "1\n1", expected: "1", hidden: false },
        { id: 3, input: "5\n5 4 -1 7 8", expected: "23", hidden: false },
        { id: 4, input: "3\n-1 -2 -3", expected: "-1", hidden: false },
        { id: 5, input: "4\n1 2 3 4", expected: "10", hidden: true },
        { id: 6, input: "4\n-2 -1 -3 -4", expected: "-1", hidden: true },
        { id: 7, input: "6\n-2 10 -5 10 -2 1", expected: "15", hidden: true },
        { id: 8, input: "5\n0 0 0 0 0", expected: "0", hidden: true },
        { id: 9, input: "4\n100 -50 100 -20", expected: "150", hidden: true },
        { id: 10, input: "7\n-3 2 3 -4 5 -1 2", expected: "7", hidden: true },
        { id: 11, input: "2\n-1 0", expected: "0", hidden: true },
        { id: 12, input: "5\n8 -19 5 -4 20", expected: "21", hidden: true },
        { id: 13, input: "5\n-2 -3 -1 -5 -4", expected: "-1", hidden: true },
        { id: 14, input: "4\n8 -19 5 -4", expected: "8", hidden: true },
        { id: 15, input: "6\n1 2 3 4 5 6", expected: "21", hidden: true }
      ]
    },

    // 6. Climbing Stairs
    {
      id: 'climbing-stairs',
      number: 70,
      title: '70. Climbing Stairs',
      category: '1-D Dynamic Programming',
      difficulty: 'Easy',
      description: `### 70. Climbing Stairs

You are climbing a staircase. It takes \`n\` steps to reach the top.

Each time you can either climb \`1\` or \`2\` steps. In how many distinct ways can you climb to the top?

---
### Example 1:
\`\`\`
Input: n = 2
Output: 2
Explanation: There are two ways to climb to the top:
1. 1 step + 1 step
2. 2 steps
\`\`\`

### Example 2:
\`\`\`
Input: n = 3
Output: 3
Explanation: There are three ways to climb to the top:
1. 1 step + 1 step + 1 step
2. 1 step + 2 steps
3. 2 steps + 1 step
\`\`\`

---
### Constraints:
- \`1 <= n <= 45\``,
      starterCodes: {
        python: `class Solution:
    def climbStairs(self, n: int) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int climbStairs(int n) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.climbStairs(n));
    }
}
`,
        cpp: `#include <iostream>
using namespace std;

class Solution {
public:
    int climbStairs(int n) {
        // Write your code here
        return 0;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    Solution sol;
    cout << sol.climbStairs(n) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>

int climbStairs(int n) {
    // Write your code here
    return 0;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    printf("%d\\n", climbStairs(n));
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "2", expected: "2", hidden: false },
        { id: 2, input: "3", expected: "3", hidden: false },
        { id: 3, input: "4", expected: "5", hidden: false },
        { id: 4, input: "5", expected: "8", hidden: false },
        { id: 5, input: "1", expected: "1", hidden: true },
        { id: 6, input: "6", expected: "13", hidden: true },
        { id: 7, input: "7", expected: "21", hidden: true },
        { id: 8, input: "8", expected: "34", hidden: true },
        { id: 9, input: "10", expected: "89", hidden: true },
        { id: 10, input: "15", expected: "987", hidden: true },
        { id: 11, input: "20", expected: "10946", hidden: true },
        { id: 12, input: "30", expected: "1346269", hidden: true },
        { id: 13, input: "9", expected: "55", hidden: true },
        { id: 14, input: "11", expected: "144", hidden: true },
        { id: 15, input: "12", expected: "233", hidden: true }
      ]
    },

    // 7. Single Number
    {
      id: 'single-number',
      number: 136,
      title: '136. Single Number',
      category: 'Bit Manipulation',
      difficulty: 'Easy',
      description: `### 136. Single Number

Given a **non-empty** array of integers \`nums\`, every element appears *twice* except for one. Find that single one.

You must implement a solution with a linear runtime complexity and use only constant extra space.

---
### Example 1:
\`\`\`
Input: nums = [2,2,1]
Output: 1
\`\`\`

### Example 2:
\`\`\`
Input: nums = [4,1,2,1,2]
Output: 4
\`\`\`

### Example 3:
\`\`\`
Input: nums = [1]
Output: 1
\`\`\`

---
### Constraints:
- \`1 <= nums.length <= 3 * 10^4\`
- \`-3 * 10^4 <= nums[i] <= 3 * 10^4\`
- Each element in the array appears twice except for one element which appears only once.`,
      starterCodes: {
        python: `class Solution:
    def singleNumber(self, nums: list[int]) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int singleNumber(int[] nums) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.singleNumber(nums));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
using namespace std;

class Solution {
public:
    int singleNumber(vector<int>& nums) {
        // Write your code here
        return 0;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    Solution sol;
    cout << sol.singleNumber(nums) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int singleNumber(int* nums, int numsSize) {
    // Write your code here
    return 0;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* nums = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
    printf("%d\\n", singleNumber(nums, n));
    free(nums);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "3\n2 2 1", expected: "1", hidden: false },
        { id: 2, input: "5\n4 1 2 1 2", expected: "4", hidden: false },
        { id: 3, input: "1\n1", expected: "1", hidden: false },
        { id: 4, input: "3\n-1 -1 -2", expected: "-2", hidden: false },
        { id: 5, input: "7\n10 20 30 20 10 40 30", expected: "40", hidden: true },
        { id: 6, input: "5\n99 98 99 98 100", expected: "100", hidden: true },
        { id: 7, input: "3\n0 5 0", expected: "5", hidden: true },
        { id: 8, input: "5\n7 7 8 8 9", expected: "9", hidden: true },
        { id: 9, input: "3\n-100 50 50", expected: "-100", hidden: true },
        { id: 10, input: "7\n1 2 3 4 3 2 1", expected: "4", hidden: true },
        { id: 11, input: "5\n-5 5 -5 5 0", expected: "0", hidden: true },
        { id: 12, input: "3\n1000 1000 9999", expected: "9999", hidden: true },
        { id: 13, input: "7\n-1 -1 -2 -2 100 5 5", expected: "100", hidden: true },
        { id: 14, input: "3\n0 1 0", expected: "1", hidden: true },
        { id: 15, input: "9\n9 8 7 6 5 6 7 8 9", expected: "5", hidden: true }
      ]
    },

    // 8. Container With Most Water
    {
      id: 'container-with-most-water',
      number: 11,
      title: '11. Container With Most Water',
      category: 'Two Pointers',
      difficulty: 'Medium',
      description: `### 11. Container With Most Water

You are given an integer array \`height\` of length \`n\`. There are \`n\` vertical lines drawn such that the two endpoints of the \`i\`-th line are \`(i, 0)\` and \`(i, height[i])\`.

Find two lines that together with the x-axis form a container, such that the container contains the most water.

Return *the maximum amount of water a container can store*.

---
### Example 1:
\`\`\`
Input: height = [1,8,6,2,5,4,8,3,7]
Output: 49
Explanation: The max area is between index 1 (height 8) and index 8 (height 7): min(8, 7) * (8 - 1) = 49.
\`\`\`

### Example 2:
\`\`\`
Input: height = [1,1]
Output: 1
\`\`\`

---
### Constraints:
- \`n == height.length\`
- \`2 <= n <= 10^5\`
- \`0 <= height[i] <= 10^4\``,
      starterCodes: {
        python: `class Solution:
    def maxArea(self, height: list[int]) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int maxArea(int[] height) {
        // Write your code here
        return 0;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] h = new int[n];
        for (int i = 0; i < n; i++) h[i] = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.maxArea(h));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
#include <algorithm>
using namespace std;

class Solution {
public:
    int maxArea(vector<int>& height) {
        // Write your code here
        return 0;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> h(n);
    for (int i = 0; i < n; i++) cin >> h[i];
    Solution sol;
    cout << sol.maxArea(h) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int maxArea(int* height, int heightSize) {
    // Write your code here
    return 0;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* h = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &h[i]);
    printf("%d\\n", maxArea(h, n));
    free(h);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "9\n1 8 6 2 5 4 8 3 7", expected: "49", hidden: false },
        { id: 2, input: "2\n1 1", expected: "1", hidden: false },
        { id: 3, input: "5\n4 3 2 1 4", expected: "16", hidden: false },
        { id: 4, input: "4\n1 2 4 3", expected: "4", hidden: false },
        { id: 5, input: "6\n2 3 4 5 18 17 6", expected: "17", hidden: true },
        { id: 6, input: "3\n1 2 1", expected: "2", hidden: true },
        { id: 7, input: "5\n10 9 8 7 6", expected: "24", hidden: true },
        { id: 8, input: "4\n1 1000 1000 1", expected: "1000", hidden: true },
        { id: 9, input: "2\n100 100", expected: "100", hidden: true },
        { id: 10, input: "5\n2 1 4 5 2", expected: "8", hidden: true },
        { id: 11, input: "6\n5 5 5 5 5 5", expected: "25", hidden: true },
        { id: 12, input: "4\n3 9 3 4", expected: "9", hidden: true },
        { id: 13, input: "5\n1 3 2 5 25", expected: "12", hidden: true },
        { id: 14, input: "6\n1 2 4 3 5 6", expected: "12", hidden: true },
        { id: 15, input: "7\n2 3 10 5 7 8 9", expected: "36", hidden: true }
      ]
    },

    // 9. Binary Search
    {
      id: 'binary-search',
      number: 704,
      title: '704. Binary Search',
      category: 'Binary Search',
      difficulty: 'Easy',
      tags: ['Binary Search', 'Array'],
      description: `### 704. Binary Search

Given an array of integers \`nums\` which is sorted in ascending order, and an integer \`target\`, write a function to search \`target\` in \`nums\`. If \`target\` exists, then return its index. Otherwise, return \`-1\`.

You must write an algorithm with \`O(log n)\` runtime complexity.

---
### Example 1:
\`\`\`
Input: nums = [-1,0,3,5,9,12], target = 9
Output: 4
Explanation: 9 exists in nums and its index is 4
\`\`\`

### Example 2:
\`\`\`
Input: nums = [-1,0,3,5,9,12], target = 2
Output: -1
Explanation: 2 does not exist in nums so return -1
\`\`\`

---
### Constraints:
- \`1 <= nums.length <= 10^4\`
- \`-10^4 < nums[i], target < 10^4\`
- All the integers in \`nums\` are **unique**.
- \`nums\` is sorted in ascending order.`,
      starterCodes: {
        python: `class Solution:
    def search(self, nums: list[int], target: int) -> int:
        # Write your code here
        pass
`,
        java: `import java.util.*;

public class Solution {
    public int search(int[] nums, int target) {
        // Write your code here
        return -1;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextInt()) return;
        int n = sc.nextInt();
        int[] nums = new int[n];
        for (int i = 0; i < n; i++) nums[i] = sc.nextInt();
        int target = sc.nextInt();
        Solution sol = new Solution();
        System.out.println(sol.search(nums, target));
    }
}
`,
        cpp: `#include <iostream>
#include <vector>
using namespace std;

class Solution {
public:
    int search(vector<int>& nums, int target) {
        // Write your code here
        return -1;
    }
};

int main() {
    int n;
    if (!(cin >> n)) return 0;
    vector<int> nums(n);
    for (int i = 0; i < n; i++) cin >> nums[i];
    int target;
    cin >> target;
    Solution sol;
    cout << sol.search(nums, target) << endl;
    return 0;
}
`,
        c: `#include <stdio.h>
#include <stdlib.h>

int search(int* nums, int numsSize, int target) {
    // Write your code here
    return -1;
}

int main() {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int* nums = (int*)malloc(n * sizeof(int));
    for (int i = 0; i < n; i++) scanf("%d", &nums[i]);
    int target;
    scanf("%d", &target);
    printf("%d\\n", search(nums, n, target));
    free(nums);
    return 0;
}
`
      },
      testcases: [
        { id: 1, input: "6\n-1 0 3 5 9 12\n9", expected: "4", hidden: false },
        { id: 2, input: "6\n-1 0 3 5 9 12\n2", expected: "-1", hidden: false },
        { id: 3, input: "1\n5\n5", expected: "0", hidden: false },
        { id: 4, input: "2\n2 5\n5", expected: "1", hidden: false },
        { id: 5, input: "2\n2 5\n2", expected: "0", hidden: true },
        { id: 6, input: "3\n1 3 5\n4", expected: "-1", hidden: true },
        { id: 7, input: "5\n1 2 3 4 5\n1", expected: "0", hidden: true },
        { id: 8, input: "5\n1 2 3 4 5\n5", expected: "4", hidden: true },
        { id: 9, input: "7\n-10 -5 0 3 7 9 12\n0", expected: "2", hidden: true },
        { id: 10, input: "7\n-10 -5 0 3 7 9 12\n-10", expected: "0", hidden: true },
        { id: 11, input: "7\n-10 -5 0 3 7 9 12\n12", expected: "6", hidden: true },
        { id: 12, input: "4\n1 3 5 7\n8", expected: "-1", hidden: true },
        { id: 13, input: "4\n1 3 5 7\n0", expected: "-1", hidden: true },
        { id: 14, input: "6\n10 20 30 40 50 60\n40", expected: "3", hidden: true },
        { id: 15, input: "8\n-100 -50 -20 0 10 30 70 100\n-20", expected: "2", hidden: true }
      ]
    }
  ];

  // ─── Decoupled LeetCode Adapter Architecture (Section 2) ──────────────────────
  // Question Provider -> Question Normalizer -> Exam Question Model -> Code Runner
  const questionMetadataCache = new Map();

  const QuestionNormalizer = {
    normalize(rawProblem) {
      if (!rawProblem || typeof rawProblem !== 'object') {
        return QuestionNormalizer.normalize(CATALOG[0]);
      }

      // Extract real LeetCode problem number if present in number field or title prefix ("2235. Add Two Integers")
      let num = rawProblem.number;
      const rawTitle = String(rawProblem.title || 'Coding Challenge').trim();
      const titleMatch = rawTitle.match(/^(\d+)\.\s*(.+)$/);
      let cleanTitle = rawTitle;

      if (titleMatch) {
        if (!num) num = parseInt(titleMatch[1], 10);
        cleanTitle = titleMatch[2].trim();
      } else {
        cleanTitle = rawTitle.replace(/^Problem\s*#\d+\s*[—\-:]\s*/i, '').trim();
      }

      // Match against catalog if number is missing and title matches a known LeetCode problem
      if (!num) {
        const known = CATALOG.find(p =>
          p.id === rawProblem.id ||
          p.title.toLowerCase().includes(cleanTitle.toLowerCase())
        );
        if (known && known.number) num = known.number;
      }

      const isSql = (rawProblem.language === 'sql');
      const displayTitle = (!isSql && num)
        ? `Problem #${num} — ${cleanTitle}`
        : cleanTitle;
      const leetcodeBadge = (!isSql && num)
        ? `LeetCode Problem #${num}`
        : (isSql ? 'SQL Database Challenge' : 'Coding Challenge');

      const tags = Array.isArray(rawProblem.tags) && rawProblem.tags.length > 0
        ? rawProblem.tags
        : [rawProblem.category || (isSql ? 'Database & SQL' : 'Algorithms'), rawProblem.difficulty || 'Easy'].filter(Boolean);

      return {
        ...rawProblem,
        id: rawProblem.id || `lc-${num || Date.now()}`,
        type: 'coding',
        number: num || null,
        cleanTitle,
        title: displayTitle,
        leetcodeBadge,
        category: rawProblem.category || (isSql ? 'SQL' : 'Algorithms'),
        topic: rawProblem.topic || rawProblem.category || (isSql ? 'Database & SQL' : 'Algorithms'),
        difficulty: rawProblem.difficulty || 'Easy',
        tags,
        description: rawProblem.description || '',
        starterCodes: rawProblem.starterCodes || {
          python: rawProblem.starterCode || '',
          java: '',
          cpp: '',
          c: ''
        },
        starterCode: rawProblem.starterCode || (rawProblem.starterCodes && rawProblem.starterCodes.python) || '',
        testcases: Array.isArray(rawProblem.testcases) && rawProblem.testcases.length > 0
          ? rawProblem.testcases
          : [{ id: 1, input: '', expected: '', hidden: false }]
      };
    }
  };

  const QuestionProvider = {
    getByIdOrNumber(identifier) {
      if (!identifier) return null;
      const key = String(identifier).trim().toLowerCase();
      if (questionMetadataCache.has(key)) {
        return questionMetadataCache.get(key);
      }
      const found = CATALOG.find(p =>
        String(p.id).toLowerCase() === key ||
        String(p.number) === key ||
        p.title.toLowerCase().includes(key)
      );
      if (found) {
        const normalized = QuestionNormalizer.normalize(found);
        questionMetadataCache.set(key, normalized);
        return normalized;
      }
      return null;
    },

    async fetchResilient(topic, language = 'python', category = 'General', difficulty = 'Easy', problemId = null) {
      try {
        if (problemId) {
          const direct = QuestionProvider.getByIdOrNumber(problemId);
          if (direct) return direct;
        }
        const byTopic = findProblemByTopic(topic, category, difficulty);
        if (byTopic) return QuestionNormalizer.normalize(byTopic);
      } catch (err) {
        console.warn('[LeetCode Provider] Fallback triggered:', err);
      }
      return QuestionNormalizer.normalize(CATALOG[0]);
    }
  };

  function getCategories() {
    return CATEGORIES;
  }

  function getCatalog() {
    return CATALOG.map(p => QuestionNormalizer.normalize(p));
  }

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
    if (difficulty && difficulty !== 'Any' && difficulty !== 'Random') {
      const diffPool = pool.filter(p => p.difficulty.toLowerCase() === difficulty.toLowerCase());
      if (diffPool.length) pool = diffPool;
    }
    const idx = Math.floor(Math.random() * pool.length);
    return QuestionNormalizer.normalize(pool[idx]);
  }

  function findProblemByTopic(topic, category = null, difficulty = null) {
    if (!topic || topic.trim() === '' || topic.trim().toLowerCase() === 'random') {
      return getRandomProblem(category, difficulty);
    }
    const tLower = topic.trim().toLowerCase();
    if (questionMetadataCache.has(tLower)) {
      return questionMetadataCache.get(tLower);
    }

    // Direct match by problem number, title, or ID
    const match = CATALOG.find(p =>
      String(p.number) === tLower.replace(/^#/, '') ||
      p.title.toLowerCase().includes(tLower) ||
      p.id.toLowerCase().includes(tLower) ||
      tLower.includes(p.id.toLowerCase())
    );
    if (match) {
      const norm = QuestionNormalizer.normalize(match);
      questionMetadataCache.set(tLower, norm);
      return norm;
    }

    // Match by category (supports multi-category arrays/strings)
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
        return catLowers.some(c => pCat.includes(c) || c.includes(pCat)) ||
               catLowers.some(c => tLower.includes(c) || c.includes(tLower));
      });
      if (catMatch) return QuestionNormalizer.normalize(catMatch);
    }

    // Return random problem if no direct match in catalog
    return getRandomProblem(category, difficulty);
  }

  return {
    getCategories,
    getCatalog,
    getRandomProblem,
    findProblemByTopic,
    QuestionProvider,
    QuestionNormalizer
  };
})();

if (typeof window !== 'undefined') {
  window.LEETCODE = LEETCODE;
}

