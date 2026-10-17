import * as React from 'react';
import { IPersonaProps, NormalPeoplePicker } from '@fluentui/react';
import { IPerson } from '../utils/constants';

export interface IPeoplePickerProps {
  value: IPerson | null;
  /** Returns suggestions for the typed text (the page supplies this – no data access here). */
  onSearch: (query: string) => Promise<IPerson[]>;
  onChange: (person: IPerson | null) => void;
  placeholder?: string;
  disabled?: boolean;
}

function toPersona(person: IPerson): IPersonaProps {
  return { id: person.email, text: person.name, secondaryText: person.email };
}

/** Single-person picker (Budget Head). */
export const PeoplePicker: React.FC<IPeoplePickerProps> = (props) => {
  const known = React.useRef<{ [email: string]: IPerson }>({});
  if (props.value) {
    known.current[props.value.email] = props.value;
  }

  const resolve = (filter: string): Promise<IPersonaProps[]> =>
    props.onSearch(filter).then((people) => {
      people.forEach((p) => { known.current[p.email] = p; });
      return people.map(toPersona);
    }).catch((error) => {
      console.error('People search failed:', error);
      return [];
    });

  const handleChange = (items?: IPersonaProps[]): void => {
    const first = items && items.length ? items[0] : undefined;
    const person = first && first.id ? known.current[first.id] : undefined;
    props.onChange(person || null);
  };

  return (
    <NormalPeoplePicker
      onResolveSuggestions={resolve}
      onEmptyResolveSuggestions={(): IPersonaProps[] => []}
      selectedItems={props.value ? [toPersona(props.value)] : []}
      onChange={handleChange}
      itemLimit={1}
      resolveDelay={300}
      disabled={props.disabled}
      inputProps={{ placeholder: props.placeholder || 'Type a name or email...' }}
      styles={{
        root: {
          width: '100%',
        },
        text: {
          width: '100%',
          minHeight: '38px',
          boxSizing: 'border-box',
        },
      }}
    />
  );
};
