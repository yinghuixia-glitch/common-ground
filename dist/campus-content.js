// University examples are starting points to edit, rather than policy advice.
// The English topic identifiers match the community's question categories.
export const toolbox = [
  {
    id: 'clarify-assignment',
    topic: 'Studying',
    en: {
      title: 'Clarify assignment instructions',
      description: 'Ask for a concrete example, priorities, or the expected format.',
      body: `Hello [name],

I am working on [assignment] for [course]. I understand that we need to [your understanding], but I am unsure about [specific instruction].

Could you clarify [specific question]? An example of the expected format, or a short list of the main requirements, would help me plan my work.

My current plan is [brief plan]. Please let me know if I have misunderstood anything.

Thank you,
[your name]`,
    },
    zh: {
      title: '问清楚作业要求',
      description: '请对方提供具体例子、重点或需要的格式。',
      body: `您好，[姓名]：

我正在准备[课程名称]的[作业名称]。我的理解是需要[你目前的理解]，但对于[具体要求]还不太确定。

您能说明一下[具体问题]吗？如果能给一个格式示例，或列出几个主要要求，会有助于我安排接下来的工作。

我目前打算[简短计划]。如果我的理解有偏差，也请您告诉我。

谢谢！
[你的姓名]`,
    },
  },
  {
    id: 'clearer-feedback',
    topic: 'Studying',
    en: {
      title: 'Ask for clearer feedback',
      description: 'Turn a broad comment into a specific next step.',
      body: `Hello [name],

Thank you for your feedback on [work]. I would like to understand the comment about [quote or describe the comment] so I can use it in my next draft.

Could you point to one example in my work and explain what a stronger version might do? It would also help to know which one or two changes I should prioritise.

I can discuss this by [email / a short meeting / another format].

Thank you,
[your name]`,
    },
    zh: {
      title: '请反馈再具体一点',
      description: '把比较笼统的评价变成明确的下一步。',
      body: `您好，[姓名]：

谢谢您对[作业或成果]的反馈。我想进一步理解您提到的[引用或描述那条反馈]，以便修改下一稿。

您能指出我文中的一个具体例子，并说明怎样修改会更合适吗？如果能告诉我最应优先改进的一两点，也会很有帮助。

我可以通过[邮件／简短面谈／其他方式]进一步沟通。

谢谢！
[你的姓名]`,
    },
  },
  {
    id: 'discuss-deadline',
    topic: 'Adjustments',
    en: {
      title: 'Discuss a deadline',
      description: 'Make a specific request and ask about the relevant process.',
      body: `Hello [name],

I am writing about [assignment or task], currently due on [date]. Because of [brief explanation, only what you are comfortable sharing], I am having difficulty completing it by that date.

Would it be possible to discuss [requested change, such as a new date]? I have completed [current progress], and my proposed plan is [next steps and proposed date].

If I need to use a formal request process, could you tell me where to find it and whom to contact? Please let me know what is possible before I change my submission plan.

Thank you,
[your name]`,
    },
    zh: {
      title: '商量截止日期',
      description: '提出具体请求，并了解学校或课程的办理流程。',
      body: `您好，[姓名]：

我想和您沟通[作业或任务]的截止日期，目前是[日期]。由于[简要原因，只写你愿意分享的部分]，我在按时完成方面遇到了一些困难。

是否可以讨论[具体请求，例如调整到某个日期]？目前我已经完成[进展]，接下来的计划是[步骤和拟定日期]。

如果需要通过正式流程申请，能否告诉我在哪里查看，以及应该联系谁？我会先确认可行的安排，再调整自己的提交计划。

谢谢！
[你的姓名]`,
    },
  },
  {
    id: 'group-work-roles',
    topic: 'Communication',
    en: {
      title: 'Agree on group-work roles',
      description: 'Make tasks, communication, and next check-ins explicit.',
      body: `Hi everyone,

Could we write down how we will work together on [project]? Here is a starting point for us to edit:

Tasks and people responsible: [task — person — agreed date]
Where we keep shared work: [location]
Where we send updates: [channel]
When replies are usually needed: [agreed time frame]
Next check-in: [date and format]

I would find [your communication preference] helpful. Please add what would help you, too. If plans change or someone gets stuck, how should we let each other know?

Does this arrangement work for everyone?
[your name]`,
    },
    zh: {
      title: '把小组分工说清楚',
      description: '一起约定任务、沟通方式和下一次确认进展的时间。',
      body: `大家好：

我们能不能把[项目名称]的合作安排写下来？下面是一个可以一起修改的初稿：

任务与负责人：[任务—负责人—约定日期]
共享文件放在哪里：[位置]
在哪里发送更新：[沟通渠道]
通常希望多久内回复：[共同商定的时间]
下一次确认进展：[日期和方式]

对我来说，[你的沟通偏好]会比较有帮助。也欢迎大家补充适合自己的方式。如果计划变了，或者有人遇到困难，我们怎样提醒彼此比较好？

这样的安排对大家都合适吗？
[你的姓名]`,
    },
  },
  {
    id: 'staff-feedback-preferences',
    topic: 'Communication',
    en: {
      title: 'Ask students about feedback preferences',
      description: 'A staff template for offering choices without asking for a diagnosis.',
      body: `Hello [name / everyone],

I would like to make feedback on [course or task] easier to use. Which of these would help you: written comments, a short conversation, examples, or a brief list of next steps?

You are welcome to suggest another format or tell me privately. There is no need to share a diagnosis or personal information to describe a preference.

I can currently offer [available options]. If your preferred format is not available, we can discuss an alternative. You may also change your preference later.

Best wishes,
[your name and role]`,
    },
    zh: {
      title: '询问学生喜欢怎样的反馈',
      description: '教职员工可以提供选择，让学生说明偏好，无须解释诊断。',
      body: `你好，[姓名／大家]：

我希望[课程或任务]的反馈更容易理解和使用。以下哪些方式对你有帮助：书面意见、简短交流、具体示例，或者列出接下来的一两个步骤？

也欢迎你提出其他形式，或私下告诉我。说明自己的偏好时，不需要提供诊断或个人信息。

目前我可以提供[可用选项]。如果暂时无法采用你最喜欢的方式，我们可以再讨论其他安排。之后你也可以调整自己的选择。

祝好！
[你的姓名和身份]`,
    },
  },
  {
    id: 'contact-campus-support',
    topic: 'Campus life',
    en: {
      title: 'Find the right university support',
      description: 'Ask who can help and what the first step involves.',
      body: `Hello [team or name],

I am a [student / staff member] at [university]. I would like to ask about support with [specific situation, such as organising study, accessing teaching, or settling into campus life].

Is your team the right place to start? If not, could you direct me to the appropriate service?

Could you explain the first step, any information needed, and whether there are any costs? Before I share personal details, I would also like to know how they would be used and who could access them.

My preferred way to communicate is [format or language].

Thank you,
[your name]`,
    },
    zh: {
      title: '找到合适的学校支持',
      description: '先问清楚可以找谁，以及第一步需要做什么。',
      body: `您好，[部门或姓名]：

我是[学校名称]的[学生／教职员工]，想了解在[具体情境，例如安排学习、参与教学或适应校园生活]方面有哪些支持。

请问可以先向您这里咨询吗？如果不是，能否告诉我应该联系哪个部门？

我想了解第一步怎么办、需要提供哪些信息，以及是否涉及费用。在分享个人情况之前，也想知道这些信息会如何使用、哪些人能够看到。

我比较方便的沟通方式是[方式或语言]。

谢谢！
[你的姓名]`,
    },
  },
];

export const scenarios = [
  {
    id: 'unclear-instructions',
    topic: 'Studying',
    en: {
      title: '“Critically discuss” — what should I do?',
      situation: 'An assignment asks for a critical discussion, but gives no example or suggested structure.',
      perspectives: [
        'A student may need a concrete example to distinguish describing an idea from evaluating it.',
        'A lecturer may have intended an open format so students can choose their own approach.',
      ],
      questions: [
        'Could you show one example of the kind of analysis you expect?',
        'Which requirements are essential, and where can I choose my own structure?',
      ],
    },
    zh: {
      title: '“批判性讨论”到底要怎么写？',
      situation: '作业要求“进行批判性讨论”，但没有提供示例或建议结构。',
      perspectives: [
        '学生可能需要一个具体例子，才能分清描述一种观点与评估一种观点的区别。',
        '教师可能希望保持形式开放，让学生自己选择合适的思路。',
      ],
      questions: [
        '能否给一个您希望看到的分析方式的例子？',
        '哪些要求必须满足，哪些部分可以由我自行安排？',
      ],
    },
  },
  {
    id: 'last-minute-change',
    topic: 'Campus life',
    en: {
      title: 'The meeting changed at the last minute',
      situation: 'A group meeting moves to a different room and time shortly before it starts.',
      perspectives: [
        'A member may already have planned travel, other tasks, or a quieter route around the original arrangement.',
        'The organiser may be responding to a room cancellation and may not know how the change affects others.',
      ],
      questions: [
        'Could we confirm changes in one agreed channel and say what has changed?',
        'If I cannot attend the new time, how can I contribute or catch up?',
      ],
    },
    zh: {
      title: '会议时间和地点临时变了',
      situation: '小组会议快开始时，时间和教室都发生了变动。',
      perspectives: [
        '有人可能已经根据原安排规划好出行、其他任务，或一条比较安静的路线。',
        '组织者可能正在处理教室被取消的情况，也还不清楚改动给其他人带来的影响。',
      ],
      questions: [
        '以后能否在一个约定的渠道里，明确说明哪些安排变了？',
        '如果我无法参加新的时间，可以怎样参与或补上会议内容？',
      ],
    },
  },
  {
    id: 'group-chat-pace',
    topic: 'Communication',
    en: {
      title: 'The group chat moves too quickly',
      situation: 'A project chat has many messages, and decisions are made before one member replies.',
      perspectives: [
        'A member may need time to read, think, or check the chat around other commitments.',
        'Other members may be trying to keep the project moving and may not realise a decision was missed.',
      ],
      questions: [
        'Could we put proposed decisions in a short summary and agree when replies are needed?',
        'How should we check that everyone has had a chance to contribute?',
      ],
    },
    zh: {
      title: '小组群的消息太快了',
      situation: '项目群里消息很多，一位成员还没有回复，大家就已经作出了决定。',
      perspectives: [
        '有人可能需要时间阅读和思考，或需要在其他安排之间查看消息。',
        '其他成员可能希望尽快推进项目，没有意识到有人错过了这个决定。',
      ],
      questions: [
        '能否把待确认的决定简短汇总，并一起约定回复时间？',
        '我们怎样确认每个人都已经有机会表达意见？',
      ],
    },
  },
  {
    id: 'vague-feedback',
    topic: 'Studying',
    en: {
      title: 'The feedback says “be clearer”',
      situation: 'Feedback on a draft says “be clearer”, but does not identify a passage or a possible revision.',
      perspectives: [
        'The writer may be willing to revise but unsure which part needs attention.',
        'The person giving feedback may have noticed a pattern and assumed a brief comment would explain it.',
      ],
      questions: [
        'Could you point to one sentence or paragraph that shows the issue?',
        'Would adding an example, changing the structure, or explaining a term address it?',
      ],
    },
    zh: {
      title: '反馈说“再清楚一点”',
      situation: '初稿的反馈写着“再清楚一点”，却没有指出具体段落或建议怎样修改。',
      perspectives: [
        '写作者可能愿意修改，但还不确定应该先处理哪一部分。',
        '给出反馈的人可能发现了一个反复出现的问题，并以为简短的评价已经说明了意思。',
      ],
      questions: [
        '能否指出一个能体现这个问题的句子或段落？',
        '补充例子、调整结构或解释术语，哪一种修改更接近您的意思？',
      ],
    },
  },
  {
    id: 'reply-time',
    topic: 'Communication',
    en: {
      title: 'When should I expect a reply?',
      situation: 'A student emails a question and sends another message later that day, while the staff member has not had time to respond.',
      perspectives: [
        'The student may be worried about a deadline and may not know the usual response time.',
        'The staff member may be teaching or working through messages, and may not have seen the deadline in the first email.',
      ],
      questions: [
        'What response time and contact channel should we normally use?',
        'How can I explain a time-sensitive question, and where should I look while waiting?',
      ],
    },
    zh: {
      title: '多久可以期待收到回复？',
      situation: '学生发邮件提问，当天又发了一条消息；教职员工还没来得及回复。',
      perspectives: [
        '学生可能担心截止日期，也不清楚通常需要等待多久。',
        '教职员工可能正在上课或依次处理邮件，也可能没在第一封邮件里看到时间要求。',
      ],
      questions: [
        '通常可以期待多久内收到回复，使用哪个渠道比较合适？',
        '有时间要求的问题应该怎样说明，等待时可以先在哪里查找信息？',
      ],
    },
  },
];
