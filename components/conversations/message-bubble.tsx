import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/utils";

export type Message = {
  id: number;
  role: string;
  content: string;
  created_at: string;
};

export function MessageBubble({
  message,
  locale,
}: {
  message: Message;
  locale: string;
}) {
  const fromUser = message.role === "user";
  const fromAgent = message.role === "assistant";
  const fromOperator = message.role === "operator";

  return (
    <div className={cn("flex", fromUser ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
          fromUser && "bg-secondary text-foreground rounded-bl-sm",
          fromAgent && "bg-primary/10 text-foreground rounded-br-sm",
          fromOperator && "bg-yellow-500/10 text-foreground rounded-br-sm border border-yellow-500/30",
        )}
      >
        {fromOperator ? (
          <div className="text-[10px] uppercase tracking-wider text-yellow-500 font-bold mb-1">
            Operador
          </div>
        ) : null}
        <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        <p className="mt-1 text-[10px] text-muted-foreground/70">
          {formatRelative(message.created_at, locale)}
        </p>
      </div>
    </div>
  );
}
