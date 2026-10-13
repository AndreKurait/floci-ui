import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ComputePanel } from "./ComputePanel";
import { describeEc2Instance, updateEc2InstanceTags } from "@/api/aws/ec2.api";

vi.mock("@/api/aws/ec2.api", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/api/aws/ec2.api")>(),
  describeEc2Instance: vi.fn(),
  updateEc2InstanceTags: vi.fn(),
}));

test("the console protects system tags and refreshes after saving an ordinary tag", async () => {
  vi.mocked(describeEc2Instance).mockResolvedValue({
    instanceId: "i-test", name: "test", state: "running", instanceType: "t3.nano",
    tags: [{ key: "aws:autoscaling:groupName", value: "group" }, { key: "Name", value: "before" }],
    securityGroups: [],
  });
  vi.mocked(updateEc2InstanceTags).mockResolvedValue(undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}>
    <ComputePanel cloud="aws" runtimeReachable resource={{
      id: "i-test", name: "test", cloud: "aws", service: "compute", type: "instance",
      region: "us-east-1", createdAt: null, metadata: {},
    }} />
  </QueryClientProvider>);
  await user.click(await screen.findByRole("button", { name: "Tags" }));
  expect(screen.getByDisplayValue("aws:autoscaling:groupName")).toHaveAttribute("readonly");
  expect(screen.getByDisplayValue("group")).toHaveAttribute("readonly");
  expect(screen.getAllByRole("button", { name: "Remove" })).toHaveLength(1);
  await user.clear(screen.getByDisplayValue("before"));
  await user.type(screen.getByPlaceholderText("Value"), "after");
  await user.click(screen.getByRole("button", { name: "Save tags" }));
  await waitFor(() => expect(updateEc2InstanceTags).toHaveBeenCalledWith(
    "i-test", [{ key: "Name", value: "after" }], [],
  ));
  await waitFor(() => expect(describeEc2Instance).toHaveBeenCalledTimes(2));
});
