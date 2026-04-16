"use client";

import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownProps {
  content: string;
  className?: string;
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none dark:prose-invert [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, ...props }) => (
            <p className="my-2 leading-relaxed" {...props}>
              {children}
            </p>
          ),
          h1: ({ children, ...props }) => (
            <h1 className="text-lg font-bold mt-4 mb-2" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-base font-bold mt-4 mb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-sm font-bold mt-3 mb-1.5" {...props}>
              {children}
            </h3>
          ),
          ul: ({ children, ...props }) => (
            <ul className="my-2 ml-4 list-disc space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed" {...props}>
              {children}
            </li>
          ),
          hr: (props) => <hr className="my-4 border-current/20" {...props} />,
          pre: ({ children, ...props }) => (
            <pre
              className="my-3 rounded-md bg-black/5 dark:bg-white/5 p-3 overflow-x-auto text-xs"
              {...props}
            >
              {children}
            </pre>
          ),
          code: ({ children, className: codeClassName, ...props }) => {
            if (!codeClassName) {
              return (
                <code
                  className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 text-xs font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("text-xs font-mono", codeClassName)} {...props}>
                {children}
              </code>
            );
          },
          a: ({ children, ...props }) => (
            <a
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          blockquote: ({ children, ...props }) => (
            <blockquote className="my-2 border-l-2 border-current/20 pl-3 italic" {...props}>
              {children}
            </blockquote>
          ),
          table: ({ children, ...props }) => (
            <div className="my-3 overflow-x-auto">
              <table className="text-xs w-full border-collapse" {...props}>
                {children}
              </table>
            </div>
          ),
          th: ({ children, ...props }) => (
            <th className="border px-2 py-1 text-left font-semibold bg-muted" {...props}>
              {children}
            </th>
          ),
          td: ({ children, ...props }) => (
            <td className="border px-2 py-1" {...props}>
              {children}
            </td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
