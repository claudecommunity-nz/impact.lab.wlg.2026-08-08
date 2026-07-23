"use client";

import {
  Button,
  Input,
  Label,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@wcc-impact/plugin-sdk";
import type { RegisteredWidget } from "../../lib/widgets";

export function WidgetConfigurationSheet({
  open,
  definition,
  config,
  onOpenChange,
  onConfigChange,
}: {
  open: boolean;
  definition?: RegisteredWidget;
  config: Readonly<Record<string, unknown>>;
  onOpenChange: (open: boolean) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const options = definition?.widget.options ?? [];
  const update = (key: string, value: unknown) =>
    onConfigChange({ ...config, [key]: value });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            Configure {definition?.widget.name ?? "widget"}
          </SheetTitle>
          <SheetDescription>
            These settings apply only to this widget instance. Add another
            instance to monitor a different focus.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          {options.map((option) => {
            const id = `widget-option-${option.key}`;
            return (
              <div key={option.key} className="space-y-2">
                {option.type === "boolean" ? (
                  <label
                    htmlFor={id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-muted/20 p-3"
                  >
                    <input
                      id={id}
                      type="checkbox"
                      checked={config[option.key] === true}
                      onChange={(event) =>
                        update(option.key, event.target.checked)
                      }
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span>
                      <span className="block text-sm font-medium text-foreground">
                        {option.label}
                      </span>
                      {option.description && (
                        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </label>
                ) : (
                  <>
                    <Label htmlFor={id}>{option.label}</Label>
                    {option.type === "text" && (
                      <Input
                        id={id}
                        value={String(config[option.key] ?? "")}
                        placeholder={option.placeholder}
                        maxLength={option.maxLength}
                        onChange={(event) =>
                          update(option.key, event.target.value)
                        }
                      />
                    )}
                    {option.type === "select" && (
                      <select
                        id={id}
                        value={String(config[option.key] ?? "")}
                        onChange={(event) =>
                          update(option.key, event.target.value)
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                      >
                        {option.choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    )}
                    {option.type === "number" && (
                      <Input
                        id={id}
                        type="number"
                        value={Number(config[option.key] ?? 0)}
                        min={option.min}
                        max={option.max}
                        step={option.step}
                        onChange={(event) => {
                          const value = event.target.valueAsNumber;
                          update(
                            option.key,
                            Number.isFinite(value)
                              ? value
                              : option.defaultValue ?? option.min ?? 0,
                          );
                        }}
                      />
                    )}
                    {option.description && (
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {option.description}
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button type="button">Done</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
