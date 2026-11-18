import { Avatar, AvatarFallback, AvatarImage } from "@ui-sdk/react/avatar";
import { usePeople } from "./data";

export function Face(props: { id?: string; name?: string; size?: number }) {
  const { size = 22 } = props;
  const person = usePeople().find((person) => person._id === props.id);
  return (
    <Avatar
      className="face"
      style={{ width: size, height: size, fontSize: size * 0.48 }}
      aria-hidden
    >
      {person?.image && <AvatarImage src={person.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>
        {(person?.name ?? props.name ?? "").slice(0, 1).toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}
