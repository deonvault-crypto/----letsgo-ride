import {
  groupHomeRoute,
  homeRouteForRole,
  isProductGroup,
  isProductRootRoute,
  isRoleShellGroup,
  productAccountRoute,
  productHomeRoute,
  productRoleFromParam,
  shellGroupForRole,
} from "../navigation/roleRoutes";

describe("canonical role routing", () => {
  it("maps every authenticated role to one home route and shell group", () => {
    expect(homeRouteForRole("passenger")).toBe("/(customer)/home");
    expect(homeRouteForRole("driver")).toBe("/(driver)/home");
    expect(homeRouteForRole("courier")).toBe("/(courier)/home");
    expect(homeRouteForRole("merchant")).toBe("/(merchant)/home");
    expect(homeRouteForRole("admin")).toBe("/(admin)/dashboard");
    expect(homeRouteForRole()).toBe("/(customer)/home");

    expect(shellGroupForRole("passenger")).toBe("(customer)");
    expect(shellGroupForRole("driver")).toBe("(driver)");
    expect(shellGroupForRole("courier")).toBe("(courier)");
    expect(shellGroupForRole("merchant")).toBe("(merchant)");
    expect(shellGroupForRole("admin")).toBe("(admin)");
    expect(shellGroupForRole()).toBe("(customer)");
  });

  it("recognizes only application role shells", () => {
    for (const group of ["(customer)", "(driver)", "(courier)", "(merchant)", "(admin)"]) {
      expect(isRoleShellGroup(group)).toBe(true);
    }
    expect(isRoleShellGroup("(shared)")).toBe(false);
    expect(isRoleShellGroup("(auth)")).toBe(false);
  });

  it("keeps product home, account and root-route fallbacks in one registry", () => {
    expect(productHomeRoute("customer")).toBe("/(customer)/home");
    expect(productHomeRoute("driver")).toBe("/(driver)/home");
    expect(productAccountRoute("customer")).toBe("/(shared)/account");
    expect(productAccountRoute("merchant")).toBe("/(merchant)/account");
    expect(groupHomeRoute("(courier)")).toBe("/(courier)/home");

    expect(isProductGroup("(driver)")).toBe(true);
    expect(isProductGroup("(shared)")).toBe(true);
    expect(isProductGroup("(admin)")).toBe(false);
    expect(isProductRootRoute("(driver)", "availability")).toBe(true);
    expect(isProductRootRoute("(driver)", "vehicle-setup")).toBe(false);
  });

  it("accepts only product roles that can contextualize shared account routes", () => {
    expect(productRoleFromParam("driver")).toBe("driver");
    expect(productRoleFromParam("courier")).toBe("courier");
    expect(productRoleFromParam("merchant")).toBe("merchant");
    expect(productRoleFromParam("customer")).toBeUndefined();
    expect(productRoleFromParam("admin")).toBeUndefined();
  });
});
