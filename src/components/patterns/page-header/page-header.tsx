type Props = {
  title: string;
  actions?: React.ReactNode;
};

export function PageHeader({ title, actions }: Props) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between lg:mb-8">
      <div className="min-w-0">
        <h1 className="text-h1 font-bold tracking-tight text-foreground">
          {title}
        </h1>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
