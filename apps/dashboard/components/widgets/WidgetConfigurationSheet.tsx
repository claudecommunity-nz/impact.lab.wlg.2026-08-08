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
import { MAX_WIDGET_DISPLAY_NAME_LENGTH } from "../../lib/widgets";
import type { RegisteredWidget } from "../../lib/widgets";

export function WidgetConfigurationSheet({
  open,
  definition,
  displayName,
  config,
  onOpenChange,
  onDisplayNameChange,
  onConfigChange,
}: {
  open: boolean;
  definition?: RegisteredWidget;
  displayName: string;
  config: Readonly<Record<string, unknown>>;
  onOpenChange: (open: boolean) => void;
  onDisplayNameChange: (displayName: string) => void;
  onConfigChange: (config: Record<string, unknown>) => void;
}) {
  const options = definition?.widget.options ?? [];
  const update = (key: string, value: unknown) =>
    onConfigChange({ ...config, [key]: value });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Configure widget</SheetTitle>
          <SheetDescription>
            Give this instance a recognisable name and tune its focus. Changes
            apply only to this copy.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4">
          {definition && (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Widget source
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {definition.module.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {definition.widget.name}
              </p>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="widget-display-name">Widget name</Label>
            <Input
              id="widget-display-name"
              value={displayName}
              placeholder={definition?.widget.name ?? "Widget name"}
              maxLength={MAX_WIDGET_DISPLAY_NAME_LENGTH}
              onChange={(event) => onDisplayNameChange(event.target.value)}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Leave blank to use the default widget name.
            </p>
          </div>
          {options.length > 0 && (
            <div className="border-t border-border pt-4">
              <p className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                Widget options
              </p>
            </div>
          )}
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
