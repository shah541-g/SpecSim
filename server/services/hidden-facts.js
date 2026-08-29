function convertRequirementsToNaturalFacts(hiddenRequirements = []) {
  return hiddenRequirements.map((requirement) => {
    switch (requirement.id) {
      case 'REQ-001':
        return 'The pharmacy has separate roles for pharmacists, technicians, cashiers, managers, and administrators, and medication actions need to be clearly accountable.';
      case 'REQ-002':
        return 'The business is expanding beyond a single location and needs a way to manage several branches without losing visibility or creating local chaos.';
      case 'REQ-003':
        return 'Stock levels, expiry dates, and batch information matter a lot because medicine waste and shortages can become operational problems.';
      case 'REQ-004':
        return 'Prescription intake, repeat fills, and careful handling of restricted medicines are part of the day-to-day workflow.';
      case 'REQ-005':
        return 'The operation deals with retail payments, reimbursement, and end-of-day reconciliation rather than a single simple checkout flow.';
      case 'REQ-006':
        return 'The owners need insight into sales trends, stock movement, and branch performance to make practical management decisions.';
      case 'REQ-007':
        return 'Suppliers, purchase orders, and reorder planning matter because medicine availability and cost control are important.';
      case 'REQ-008':
        return 'The business keeps patient and customer records to support repeat interactions, history, and safer service.';
      case 'REQ-009':
        return 'The system has to fit around real store operations, existing tools, limited training time, and the need to avoid disruptions during busy periods.';
      default:
        return requirement.description || 'There are important operational realities the client expects the system to handle.';
    }
  });
}

module.exports = {
  convertRequirementsToNaturalFacts,
};
