import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { TagEditor } from "./TagEditor";

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/api/aws/ec2.mutations", () => ({
  useUpdateEc2InstanceTagsMutation: () => ({ mutate, isPending: false }),
}));

beforeEach(() => mutate.mockClear());

test("shows AWS-owned tags read-only and saves only user tag changes", async () => {
  render(<TagEditor instanceId="i-test" initialTags={[
    { key: "aws:autoscaling:groupName", value: "group" },
    { key: "AWS:other", value: "managed" },
    { key: "Name", value: "old" },
    { key: "remove-me", value: "old" },
  ]} />);
  const user = userEvent.setup();
  expect(screen.getByDisplayValue("aws:autoscaling:groupName")).toHaveAttribute("readonly");
  expect(screen.getByDisplayValue("group")).toHaveAttribute("readonly");
  expect(screen.getByDisplayValue("AWS:other")).toHaveAttribute("readonly");
  expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(2);
  await user.clear(screen.getAllByPlaceholderText("Value")[0]);
  await user.type(screen.getAllByPlaceholderText("Value")[0], "updated");
  await user.click(screen.getAllByRole("button", { name: "Remove" })[1]);
  await user.click(screen.getByRole("button", { name: "Save tags" }));
  expect(mutate).toHaveBeenCalledWith({
    instanceId: "i-test", toAdd: [{ key: "Name", value: "updated" }], toRemove: ["remove-me"],
  }, expect.anything());
});

test.each(["aws:custom", "AWS:custom", "aWs:custom"])("rejects a new reserved key %s without locking its input", async (key) => {
  render(<TagEditor instanceId="i-test" initialTags={[]} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add tag" }));
  await user.type(screen.getByPlaceholderText("Key"), key);
  await user.click(screen.getByRole("button", { name: "Save tags" }));
  expect(screen.getByText("Tag keys starting with 'aws:' are reserved for AWS.")).toBeVisible();
  expect(mutate).not.toHaveBeenCalled();
  await user.clear(screen.getByPlaceholderText("Key"));
  await user.type(screen.getByPlaceholderText("Key"), "Name");
  await user.click(screen.getByRole("button", { name: "Save tags" }));
  expect(mutate).toHaveBeenCalledWith({
    instanceId: "i-test", toAdd: [{ key: "Name", value: "" }], toRemove: [],
  }, expect.anything());
});
test("keeps unsaved edits on refresh and does not delete externally added tags", async () => {
  const { rerender } = render(<TagEditor instanceId="i-test" initialTags={[
    { key: "aws:autoscaling:groupName", value: "group-a" },
    { key: "Name", value: "before" },
  ]} />);
  const user = userEvent.setup();
  await user.clear(screen.getByDisplayValue("before"));
  await user.type(screen.getByPlaceholderText("Value"), "draft");
  rerender(<TagEditor instanceId="i-test" initialTags={[
    { key: "aws:autoscaling:groupName", value: "group-b" },
    { key: "Name", value: "external" },
    { key: "External", value: "keep" },
  ]} />);
  expect(screen.getByDisplayValue("draft")).toBeVisible();
  expect(screen.getByDisplayValue("group-b")).toHaveAttribute("readonly");
  await user.click(screen.getByRole("button", { name: "Save tags" }));
  expect(mutate).toHaveBeenCalledWith({
    instanceId: "i-test", toAdd: [{ key: "Name", value: "draft" }], toRemove: [],
  }, expect.anything());
});

test("refreshes pristine rows without starting a draft", () => {
  const { rerender } = render(<TagEditor instanceId="i-test" initialTags={[{ key: "Name", value: "before" }]} />);
  rerender(<TagEditor instanceId="i-test" initialTags={[{ key: "Name", value: "after" }]} />);
  expect(screen.getByDisplayValue("after")).toBeVisible();
  expect(screen.queryByDisplayValue("before")).not.toBeInTheDocument();
});
