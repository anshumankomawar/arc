import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar";
import { useQuery } from "convex-helpers/react/cache";
import type { CSSProperties } from "react";
import { api } from "./data";

export function Face(props: { id?: string; name?: string; size?: number }) {
  const { size = 22 } = props;
  const people = useQuery(api.workspace.people, props.id ? {} : "skip");
  const person = people?.find((person) => person._id === props.id);
  return (
    <Avatar className="face" style={{ "--face": `${size}px` } as CSSProperties} aria-hidden>
      {person?.image && <AvatarImage src={person.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>
        {(person?.name ?? props.name ?? "").slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
