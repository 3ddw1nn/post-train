export const BLOG_POSTS: {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  body: string[];
}[] = [
  {
    slug: "post-once-everywhere",
    title: "Post once, everywhere: the case for boring distribution",
    date: "2026-07-01",
    excerpt:
      "Your content strategy probably doesn't need more creativity. It needs a distribution habit that survives a busy week.",
    body: [
      "Most creators don't have a content problem — they have a re-uploading problem. The clip is done. The caption is written. What kills the streak is opening five apps, resizing five times, and retyping the same hashtags with a phone keyboard.",
      "Distribution should be the most boring part of your pipeline. Batch your content when you have energy, load it into a queue, and let the schedule do the showing up for you.",
      "Our rule of thumb: if a step happens after you hit 'export', it should be automated. Everything before that is craft; everything after is logistics.",
    ],
  },
  {
    slug: "queue-slots-beat-calendars",
    title: "Why queue slots beat picking times by hand",
    date: "2026-07-10",
    excerpt:
      "Choosing a datetime for every post is decision fatigue disguised as strategy. Weekly slots fix it.",
    body: [
      "Every time you schedule a post by hand you make three decisions: which day, which hour, which minute. Multiply by five platforms and thirty posts a month, and you've spent an afternoon on decisions your audience will never notice.",
      "A weekly slot grid inverts this. You decide once — say 11am and 4pm on weekdays — and every new post takes the next open seat. Consistency compounds; cleverness about posting minutes doesn't.",
      "Bonus: enable a ±10 minute jitter so your feed doesn't look like a robot with a wristwatch.",
    ],
  },
];
